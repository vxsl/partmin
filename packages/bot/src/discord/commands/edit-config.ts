import config, { SearchParams } from "config.js";
import {
  ActionRowBuilder,
  ButtonStyle,
  CommandInteraction,
  Events,
  ModalBuilder,
  SelectMenuComponentOptionData,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { componentGroup, sendInteractive } from "discord/interactive/index.js";
import { discordFormat } from "discord/util.js";
import { Reflect } from "runtypes";
import { isDefaultValue } from "util/config.js";
import {
  accessNestedProperty,
  accessParentOfNestedProperty,
  maxEmptyLines,
} from "util/data.js";
import { log } from "util/log.js";
import { aOrAn, nonEmptyArrayOrError, notUndefined } from "util/misc.js";
import { getRecord, traverseRuntype } from "util/runtypes.js";

const translate = (s: Reflect["tag"], options?: { useArticle?: boolean }) =>
  s === "boolean"
    ? "true or false"
    : s === "string"
    ? "text"
    : options?.useArticle
    ? aOrAn(s)
    : s;
const getTypeDescription = (
  f: Reflect,
  options?: { omitOptional?: boolean; useArticle?: boolean }
) =>
  f.tag === "optional"
    ? `${options?.omitOptional ? "" : "optional "}${translate(
        f.underlying.tag,
        { useArticle: options?.useArticle }
      )}`
    : translate(f.tag, { useArticle: options?.useArticle });

const recursivePrint = (
  runtype: Reflect,
  _path: string,
  lvl: number = 0
): {
  min: string;
  full: string;
} => {
  let min = "";
  let full = "";

  const indent = !lvl ? "" : `${"  ".repeat(lvl)}`;

  if (runtype.tag === "record") {
    for (const [key, f] of Object.entries(runtype.fields)) {
      const path = _path ? `${_path}.${key}` : key;
      const record =
        f.tag === "record"
          ? f
          : f.tag === "optional" && f.underlying.tag === "record"
          ? f.underlying
          : undefined;

      const prefix = `${indent}- `;

      if (record && Object.keys(record.fields).length > 0) {
        const inner = recursivePrint(record, path, lvl + 1);
        const printCategory = (contents: string) =>
          (contents
            ? `\n${prefix}${discordFormat(key, {
                underline: true,
              })}:\n${contents}`
            : "") + "\n";
        min += printCategory(inner.min);
        full += printCategory(inner.full);
      } else {
        const isPresent =
          key in accessParentOfNestedProperty(config.search.params, path);
        const isDefault = isDefaultValue(path, {
          baseNest: (c) => c.search.params,
        });
        const value = accessNestedProperty(config.search.params, path);
        if (isPresent && !isDefault) {
          const definedValue =
            `${prefix}📝 ` +
            `${discordFormat(key, { bold: true })}: ${discordFormat(value, {
              monospace: true,
              bold: true,
            })}` +
            "\n";
          min += definedValue;
          full += definedValue;
        } else {
          full +=
            prefix +
            (isDefault
              ? `⚫️ ` +
                `${key}: ${discordFormat(value, {
                  monospace: true,
                })} ${discordFormat(`(default)`, { italic: true })}` +
                "\n"
              : `${key} ${discordFormat(`(${getTypeDescription(f)})`, {
                  italic: true,
                })}` + "\n");
        }
      }
    }
  }

  return { min, full };
};

const printSearchParams = () => {
  const { min: _min, full: _full } = recursivePrint(SearchParams, "");
  return {
    min: maxEmptyLines(_min, 1),
    full: maxEmptyLines(_full, 1),
  };
};

const keyEmoji = "📁";
const valueEmoji = "📄";

const getConfigSelectOptions = (
  record: NonNullable<ReturnType<typeof getRecord>>
): SelectMenuComponentOptionData[] => {
  return Object.entries(record.fields).map(([k, _v]) => ({
    label: getRecord(_v) ? `${keyEmoji} ${k}` : `${valueEmoji} ${k}`,
    value: k,
  }));
};

const ids = {
  optionSelect: "optionSelect",
  toggleUnspecified: "toggleUnspecified",
  toggleEdit: "toggleEdit",
  valueEditModal: "valueEditModal",
  valueEditInput: "valueEditInput",
  upOneLevel: "upOneLevel",
};

const defaultEditPlaceholder = "select a search parameter to edit";
const pathPlaceholder = (path: string) =>
  path.length > 1
    ? // ? `${keyEmoji} ${path.startsWith(".") ? path.slice(1) : path}`
      `${keyEmoji} select a value from "${
        path.startsWith(".") ? path.slice(1) : path
      }" to edit`
    : defaultEditPlaceholder;

const editConfig = async (commandInteraction: CommandInteraction) => {
  let configPrint = printSearchParams();

  return await sendInteractive({
    commandInteraction,
    embeds: [
      { title: "Your search", description: configPrint.min, color: "#00ff00" },
    ],
    initComponentOrder: [[ids.toggleUnspecified, ids.toggleEdit]],
    componentGroupDefs: {
      edit: componentGroup<{
        showAll: boolean;
        edit: boolean;
        editPath: string;
      }>({
        initState: () => ({
          showAll: false,
          edit: false,
          asdkjasd: 2, // TODO why is this not an error?
          // TODO it's because  if you look at the destructured "state" in  initializeInteractiveMessage, it's Object
          editPath: "",
        }),
        stringSelects: {
          [ids.optionSelect]: {
            placeholder: pathPlaceholder(""),
            options: getConfigSelectOptions(SearchParams),
            mutate: async ({
              state,
              componentOrder,
              componentInteraction,
              getStringSelect,
              getButton,
              getEmbed,
            }) => {
              if (
                !(componentInteraction instanceof StringSelectMenuInteraction)
              ) {
                return { state, componentOrder };
              }
              const component = getStringSelect(ids.optionSelect);
              const option = componentInteraction.values[0];
              if (option === undefined) {
                log(
                  `Something went wrong with the option select - option is undefined`
                );
                return { state, componentOrder };
              }
              const newPath = [state.editPath, option].join(".");

              let newComponentOrder = componentOrder;

              const level = newPath.split(".").length;
              if (level > 1) {
                newComponentOrder = [
                  componentOrder[0].includes(ids.upOneLevel)
                    ? componentOrder[0]
                    : [...componentOrder[0], ids.upOneLevel],
                  ...componentOrder.slice(1),
                ];
              }

              const f = traverseRuntype(
                SearchParams,
                newPath.split(".").filter((s) => s !== "")
              );
              const record = getRecord(f);

              if (!record) {
                const isOptional = f.tag === "optional";
                await componentInteraction.showModal(
                  new ModalBuilder()
                    .setCustomId(ids.valueEditModal)
                    .setTitle(`Edit search parameter`)
                    .addComponents(
                      new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                          .setCustomId(ids.valueEditInput)
                          .setLabel(option)
                          .setStyle(TextInputStyle.Short)
                          .setRequired(!isOptional)
                          .setPlaceholder(
                            `enter ${[
                              getTypeDescription(f, {
                                omitOptional: true,
                                useArticle: true,
                              }),
                              isOptional ? ", or leave blank" : undefined,
                            ]
                              .filter(notUndefined)
                              .join("")}`
                          )
                      )
                    )
                );
                componentInteraction.client.on(
                  Events.InteractionCreate,
                  async (i) => {
                    if (!i.isModalSubmit() || i.customId !== ids.valueEditModal)
                      return;
                    configPrint = printSearchParams();
                    const b = getButton(ids.toggleUnspecified);
                    const e = getEmbed(0);
                    if (state.showAll) {
                      e.setDescription(configPrint.min);
                      b.setStyle(ButtonStyle.Secondary);
                    } else {
                      e.setDescription(configPrint.full);
                      b.setStyle(ButtonStyle.Primary);
                    }
                  }
                );

                return { state, componentOrder: newComponentOrder };
              }

              component
                .setPlaceholder(pathPlaceholder(newPath))
                .setOptions(getConfigSelectOptions(record));

              return {
                state: { ...state, editPath: newPath },
                componentOrder: newComponentOrder,
              };
            },
          },
        },
        buttons: {
          [ids.toggleUnspecified]: {
            label: "🧩",
            mutate: ({ state, getEmbed, getButton, componentOrder }) => {
              const b = getButton(ids.toggleUnspecified);
              const e = getEmbed(0);
              if (state.showAll) {
                e.setDescription(configPrint.min);
                b.setStyle(ButtonStyle.Secondary);
              } else {
                e.setDescription(configPrint.full);
                b.setStyle(ButtonStyle.Primary);
              }
              return {
                state: { ...state, showAll: !state.showAll },
                componentOrder,
              };
            },
          },
          [ids.toggleEdit]: {
            label: "⚙️",
            mutate: ({ state, componentOrder, getButton }) => {
              getButton(ids.toggleEdit).setStyle(
                state.edit ? ButtonStyle.Secondary : ButtonStyle.Primary
              );
              return {
                state: {
                  ...state,
                  edit: !state.edit,
                },
                componentOrder: nonEmptyArrayOrError(
                  state.edit
                    ? componentOrder.filter(
                        (c) => !c.includes(ids.optionSelect)
                      )
                    : [...componentOrder, [ids.optionSelect]]
                ),
              };
            },
          },
          [ids.upOneLevel]: {
            label: "⬆️",
            style: ButtonStyle.Danger,
            mutate: ({ state, componentOrder, getStringSelect }) => {
              const newPath = state.editPath.split(".").slice(0, -1).join(".");
              const newLevel = newPath.split(".").length;

              // const f = traverseRuntype(
              //   SearchParams,
              //   newPath.split(".").filter((s) => s !== "")
              // );
              // const record = getRecord(f);

              const f = traverseRuntype(
                SearchParams,
                newPath.split(".").filter((s) => s !== "")
              );
              const record = getRecord(f);
              if (!record) {
                // we shouldn't get here
                return { state, componentOrder };
              }
              getStringSelect(ids.optionSelect)
                .setPlaceholder(pathPlaceholder(newPath))
                .setOptions(getConfigSelectOptions(record));
              return {
                state: {
                  ...state,
                  editPath: newPath,
                },
                componentOrder: nonEmptyArrayOrError(
                  newLevel <= 1
                    ? componentOrder.map((c) =>
                        nonEmptyArrayOrError(
                          c.filter((c) => !c.includes(ids.upOneLevel))
                        )
                      )
                    : componentOrder
                ),
              };
            },
          },
        },
      }),
    },
  });
};

export default editConfig;
