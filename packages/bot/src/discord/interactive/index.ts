import {
  APIEmbed,
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  InteractionButtonComponentData,
  InteractionResponse,
  Message,
  MessageComponentInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuComponentData,
} from "discord.js";
import { ChannelKey } from "discord/constants.js";
import { discordIsReady } from "discord/index.js";
import { manualDiscordSend } from "discord/util.js";
import { debugLog, log } from "util/log.js";
import {
  nonEmptyArrayOrError,
  nonEmptyArrayOrUndefined,
  notNull,
  notUndefined,
  throwError,
} from "util/misc.js";
import { NonEmptyArray } from "util/type.js";

const collectorAliveTime = 24 * 3600000;

type ComponentOrder = NonEmptyArray<NonEmptyArray<string>>;
type ComponentContextHelpers = {
  getEmbed: (index: number) => EmbedBuilder;
  getButton: (customId: string) => ButtonBuilder;
  getStringSelect: (customId: string) => StringSelectMenuBuilder;
};
type CustomState = Object | undefined;
type ImmutableState<S extends CustomState> = {
  state: S;
  componentOrder: ComponentOrder;
};
type ComponentContext<S extends CustomState> = ImmutableState<S> &
  ComponentContextHelpers & {
    componentInteraction: MessageComponentInteraction;
    apply: () => Promise<InteractionResponse>;
  };

// __________________________________________________________________________________________
// component definitions:
type Mutate<S extends CustomState> = S extends Object
  ? (c: ComponentContext<S>) => ImmutableState<S> | Promise<ImmutableState<S>>
  : undefined;
type ComponentCategories<S extends CustomState> = {
  buttons?: {
    componentType: ComponentType.Button;
    builder: ButtonBuilder;
    data: { mutate?: Mutate<S> } & Omit<
      InteractionButtonComponentData,
      "type" | "style" | "customId"
    > & {
        style?: InteractionButtonComponentData["style"];
      };
  };
  stringSelects?: {
    componentType: ComponentType.StringSelect;
    builder: StringSelectMenuBuilder;
    data: { mutate?: Mutate<S> } & Omit<
      StringSelectMenuComponentData,
      "type" | "customId"
    >;
  };
};
type ComponentCategory = keyof ComponentCategories<any>;
type Builder = NonNullable<
  ComponentCategories<any>[ComponentCategory]
>["builder"];

// __________________________________________________________________________________________
// component groups:
type ComponentGroup<S extends CustomState> = {
  initState: S extends Object ? (s: ComponentContextHelpers) => S : undefined;
} & {
  [K in ComponentCategory]?: Record<
    string,
    NonNullable<ComponentCategories<S>[K]>["data"]
  >;
};
export const componentGroup = <S extends Object>(g: ComponentGroup<S>) => g;
type ComponentGroupDefs = Record<string, ComponentGroup<any>>;

// __________________________________________________________________________________________
// runtime maps:
type ComponentMap = {
  [k in ComponentCategory]: Map<
    string,
    NonNullable<ComponentCategories<any>[k]>["builder"]
  >;
};
type ComponentDefMapEntry<
  G extends ComponentGroupDefs,
  T extends ComponentCategory
> = {
  def: NonNullable<ComponentCategories<any>[T]>["data"];
  type: T;
  groupKey: keyof G;
};
type ComponentDefMap<G extends ComponentGroupDefs> = Map<
  string,
  ComponentDefMapEntry<G, "buttons"> | ComponentDefMapEntry<G, "stringSelects">
>;

// __________________________________________________________________________________________
// function used to get components according to a specified order,
// building any missing components along the way:
const getComponents = <G extends ComponentGroupDefs>({
  componentMap,
  componentDefMap,
  order,
}: {
  order: ComponentOrder;
  componentDefMap: ComponentDefMap<G>;
  componentMap?: ComponentMap;
}) => {
  const result = order.map(() => new ActionRowBuilder<Builder>());
  result.forEach((row, i) =>
    order[i]?.forEach((id) => {
      const b =
        componentMap?.buttons.get(id) ?? componentMap?.stringSelects.get(id);
      if (b) {
        row.addComponents(b);
        return;
      }
      const entry = componentDefMap.get(id);
      if (entry?.type === "buttons") {
        const built = new ButtonBuilder({
          ...entry.def,
          style: entry.def?.style ?? ButtonStyle.Secondary,
          customId: id,
        });
        componentMap?.buttons.set(id, built);
        row.addComponents(built);
        return;
      }
      if (entry?.type === "stringSelects") {
        const built = new StringSelectMenuBuilder({
          ...entry.def,
          customId: id,
        });
        componentMap?.stringSelects.set(id, built);
        row.addComponents(built);
      }
    })
  );
  return result;
};

// __________________________________________________________________________________________
// function used to start the collector for an interactive message and handle interactions:
export const startInteractive = ({
  message,
  componentGroupDefs,
}: {
  message: Message;
  componentGroupDefs: ComponentGroupDefs;
}) => {
  // ___________________________________________________________________________
  // static stuff:
  const embeds = message.embeds.map((e) => EmbedBuilder.from(e));
  const componentMap: ComponentMap = {
    buttons: new Map(),
    stringSelects: new Map(),
  };
  const componentDefMap: ComponentDefMap<typeof componentGroupDefs> = new Map(
    Object.entries(componentGroupDefs).flatMap(
      ([groupKey, { buttons = {}, stringSelects = {} }]) =>
        Object.entries({ buttons, stringSelects }).flatMap(([_type, defs]) => {
          const type = _type as ComponentCategory;
          return Object.entries(defs).map(([customId, def]) => [
            customId,
            { def, type, groupKey },
          ]);
        })
    )
  );
  // helpers for mutate callbacks:
  const getEmbed = (index: number) =>
    embeds[index] || throwError(`No embed found at index ${index}`);
  const getButton = (customId: string) =>
    componentMap.buttons.get(customId) ||
    throwError(`No button found with customId ${customId}`);
  const getStringSelect = (customId: string) =>
    componentMap.stringSelects.get(customId) ||
    throwError(`No select menu found with customId ${customId}`);

  // ___________________________________________________________________________
  // dynamic stuff:
  let componentOrder = nonEmptyArrayOrError(
    // TODO don't error?
    message.components.map((row) =>
      nonEmptyArrayOrError(
        row.components.map((c) => c.customId).filter(notNull)
      )
    )
  );
  let components: ActionRowBuilder<Builder>[] = getComponents({
    order: componentOrder,
    componentDefMap,
    componentMap,
  });
  const stateMap = new Map<keyof typeof componentGroupDefs, any>(
    Object.entries(componentGroupDefs).map(([groupKey, { initState }]) => [
      groupKey,
      initState?.({ getEmbed, getButton, getStringSelect }),
    ])
  );

  // ___________________________________________________________________________
  // start the collector:
  return message
    .createMessageComponentCollector({
      time: collectorAliveTime,
      filter: (commandInteraction) => {
        // commandInteraction.deferUpdate();
        return componentDefMap.has(commandInteraction.customId);
      },
    })
    .on("collect", async (componentInteraction) => {
      try {
        const target = componentDefMap.get(componentInteraction.customId);
        if (!target?.def?.mutate || !target?.groupKey) {
          log(
            `No definition found for customId ${componentInteraction.customId}`,
            { error: true }
          );
          return;
        }
        const oldState = stateMap.get(target.groupKey);
        const { state, componentOrder: newOrder } = await target.def.mutate({
          componentInteraction,
          state: oldState,
          getEmbed,
          componentOrder,
          getButton,
          getStringSelect,
          apply: () => componentInteraction.update({ embeds, components }),
        });
        stateMap.set(target.groupKey, state);
        if (JSON.stringify(newOrder) !== JSON.stringify(componentOrder)) {
          componentOrder = newOrder;
          components = getComponents({
            order: newOrder,
            componentMap,
            componentDefMap,
          });
        }
        // await message.edit({ embeds, components });
        // if (!componentInteraction.interac) {
        if (!componentInteraction.deferred && !componentInteraction.replied) {
          console.log("im updating");
          await componentInteraction.update({ embeds, components });
        } else {
          await componentInteraction.editReply({ embeds, components });
          console.log(
            `Im not updating because ${
              componentInteraction.deferred ? "deferred" : "replied"
            }`
          );
        }
      } catch (e) {
        log(`Error while handling interaction for message ${message.id}:`, {
          error: true,
        });
        log(e);
      }
    });
};

// __________________________________________________________________________________________
// function used to construct and send an interactive message:
export type SendEmbedOptions = {
  customSendFn?: <T extends BaseMessageOptions>(o: T) => Promise<Message>;
  channel?: ChannelKey;
  embeds: (Omit<APIEmbed, "color"> & {
    color?: string | number;
  })[];
  componentGroupDefs?: ComponentGroupDefs;
  initComponentOrder?: ComponentOrder;
};
export const constructAndSendRichMessage = async ({
  embeds: _embeds,
  componentGroupDefs,
  channel,
  initComponentOrder,
  customSendFn,
}: SendEmbedOptions) => {
  if (!discordIsReady()) {
    debugLog(
      `Discord client not ready, skipping embed${
        _embeds.length > 1 ? "s" : ""
      } send: "${_embeds.map((e) => e.title).join(", ")}"`,
      { skipDiscord: true }
    );
    return;
  }

  const payload = {
    embeds: _embeds.map((e) => ({
      ...e,
      color:
        e.color === undefined
          ? undefined
          : typeof e.color === "string"
          ? parseInt(e.color.slice(1), 16)
          : e.color,
    })),
    ...(componentGroupDefs && {
      components: getComponents({
        order:
          initComponentOrder ??
          nonEmptyArrayOrError(
            Object.entries(componentGroupDefs).flatMap(
              ([, { buttons, stringSelects }]) =>
                [
                  nonEmptyArrayOrUndefined(Object.keys(buttons ?? {})),
                  nonEmptyArrayOrUndefined(Object.keys(stringSelects ?? {})),
                ].filter(notUndefined)
            )
          ),
        componentDefMap: new Map(
          Object.entries(componentGroupDefs).flatMap(
            ([groupKey, { buttons = {}, stringSelects = {} }]) =>
              Object.entries({ buttons, stringSelects }).flatMap(
                ([type, defs]) =>
                  Object.entries(defs).map(([customId, def]) => [
                    customId,
                    { def, type: type as ComponentCategory, groupKey },
                  ])
              )
          )
        ),
      }),
    }),
  };

  const message = customSendFn
    ? await customSendFn(payload)
    : await manualDiscordSend(payload, { channel });

  if (!message) {
    log(`There was a problem sending the rich message`, { error: true });
    return;
  }
  if (!componentGroupDefs || !payload.components?.length) return;

  return startInteractive({ message, componentGroupDefs });
};
