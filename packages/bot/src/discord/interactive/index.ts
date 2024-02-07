import {
  APIEmbed,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  EmbedBuilder,
  InteractionButtonComponentData,
  Message,
  MessageComponentInteraction,
} from "discord.js";
import { ChannelKey } from "discord/constants.js";
import { discordIsReady } from "discord/index.js";
import { manualDiscordSend } from "discord/util.js";
import { debugLog, log } from "util/log.js";
import { notUndefined } from "util/misc.js";

const collectorAliveTime = 24 * 3600000;

type ButtonContext<S extends Object> = {
  state: S;
  embeds: EmbedBuilder[];
  getButton: (customId: string) => ButtonBuilder;
  apply: () => Promise<Message>;
};

type ButtonDef<S extends Object | undefined = Object> = {
  data: Omit<InteractionButtonComponentData, "type" | "style"> & {
    style?: InteractionButtonComponentData["style"];
  };
} & (S extends Object
  ? { mutate?: (context: ButtonContext<S>) => S | Promise<S> }
  : { mutate?: undefined });

export type ButtonGroup<S extends Object | undefined = Object> = {
  buttonDefs: ButtonDef<S>[];
  initState: S extends Object
    ? (context: Omit<ButtonContext<S>, "state" | "apply">) => S
    : undefined;
};

export const getButton = (message: Message, customId: string) => {
  const c = message.components
    ?.flatMap((row) => row.components)
    .find((button) => button.customId === customId);
  if (!c || c.type !== ComponentType.Button) {
    throw new Error(`No button found with customId ${customId}`);
  }
  return ButtonBuilder.from(c);
};

export type SendEmbedOptions = {
  interaction?: CommandInteraction;
  channel?: ChannelKey;
};

export type ButtonGroupsDict = {
  [k: string]: ButtonGroup;
};

export const buttonGroup = <S extends Object>(g: ButtonGroup<S>) => g;

export const sendEmbed = async ({
  embeds: _embeds,
  buttonGroups = {},
  options,
}: {
  embeds: (Omit<APIEmbed, "color"> & {
    color?: string | number;
  })[];
  buttonGroups?: Record<string, ButtonGroup<any>>;
  options?: SendEmbedOptions;
}) => {
  if (!discordIsReady()) {
    debugLog(
      `Discord client not ready, skipping embed send: "${_embeds
        .map((e) => e.title)
        .join(", ")}"`,
      { skipDiscord: true }
    );
    return;
  }

  const embeds = _embeds.map((e) => ({
    ...e,
    color:
      e.color === undefined
        ? undefined
        : typeof e.color === "string"
        ? parseInt(e.color.slice(1), 16)
        : e.color,
  }));

  const row = new ActionRowBuilder<ButtonBuilder>({
    components: Object.values(buttonGroups).flatMap(({ buttonDefs }) =>
      buttonDefs.map(
        ({ data: def }) =>
          new ButtonBuilder({
            ...def,
            style: def.style ?? ButtonStyle.Secondary,
          })
      )
    ),
  });
  const components = row.components.length ? [row] : undefined;

  let message: Message | undefined;
  if (options?.interaction) {
    const reply = await options.interaction.reply({ embeds, components });
    message = await reply.fetch();
  } else {
    message = await manualDiscordSend({ embeds, components, ...options });
  }
  if (!components) return;
  if (!message) {
    log(
      `There was a problem sending the embed: ${
        options?.interaction
          ? options.interaction.commandName
          : options?.channel
      }`,
      { error: true }
    );
    return;
  }

  return initializeInteractiveMessage({ message, buttonGroups });
};

export const initializeInteractiveMessage = ({
  message,
  buttonGroups,
}: {
  message: Message;
  buttonGroups: Record<string, ButtonGroup<any>>;
}) => {
  const buttonMap = new Map(
    Object.entries(buttonGroups).flatMap(([groupKey, group]) =>
      group.buttonDefs.map((buttonDef) => [buttonDef.data.customId, buttonDef])
    )
  );
  const buttonBuilderMap = new Map<string, ButtonBuilder>(
    message.components[0].components
      .map((c) =>
        c.type === ComponentType.Button &&
        c.customId &&
        buttonMap.has(c.customId)
          ? [c.customId, ButtonBuilder.from(c)]
          : null
      )
      .filter(notUndefined) as [string, ButtonBuilder][]
  );
  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents([
      ...buttonBuilderMap.values(),
    ]),
  ];

  const getTarget = (interaction: MessageComponentInteraction) => {
    const t = buttonMap.get(interaction.customId);
    if (!t?.mutate) return;
    return t as ButtonDef<Object> & {
      mutate: NonNullable<ButtonDef<Object>["mutate"]>;
    };
  };
  const embeds = message.embeds.map((e) => EmbedBuilder.from(e));

  const getButton = (customId: string) => {
    const b = buttonBuilderMap.get(customId);
    if (!b) {
      throw new Error(`No button found with customId ${customId}`);
    }
    return b;
  };

  const stateMap = new Map(
    Object.values(buttonGroups).flatMap(({ initState, buttonDefs }) => {
      const state = !initState ? undefined : initState({ embeds, getButton });
      return buttonDefs.map((buttonDef) => [buttonDef.data.customId, state]);
    })
  );

  return message
    .createMessageComponentCollector({
      time: collectorAliveTime,
      filter: (interaction) => {
        interaction.deferUpdate();
        return !!getTarget(interaction);
      },
    })
    .on("collect", async (interaction) => {
      try {
        const t = getTarget(interaction);
        if (!t) return;
        stateMap.set(
          t.data.customId,
          await t.mutate({
            state: stateMap.get(t.data.customId)!,
            embeds,
            getButton,
            apply: () => message.edit({ embeds, components }),
          })
        );
      } catch (e) {
        log(`Error while handling interaction for message ${message.id}:`, {
          error: true,
        });
        log(e);
      }
    });
};
