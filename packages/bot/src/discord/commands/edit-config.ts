import cache from "cache.js";
import { SearchParams } from "config.js";
import {
  ActionRowBuilder,
  ButtonStyle,
  CommandInteraction,
  ModalBuilder,
  SelectMenuComponentOptionData,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} from "discord.js";
import { editConfigColor, successColor } from "discord/constants.js";
import {
  componentGroup,
  constructAndSendRichMessage,
} from "discord/interactive/index.js";
import { discordFormat, discordWarning } from "discord/util.js";
import { Reflect } from "runtypes";
import { getConfig, isDefaultValue } from "util/config.js";
import {
  accessNestedProperty,
  accessParentOfNestedProperty,
  maxEmptyLines,
  modifyNestedProperty,
} from "util/data.js";
import { log } from "util/log.js";
import { aOrAn, nonEmptyArrayOrError, notUndefined } from "util/misc.js";
import {
  castStringToRuntype,
  getRecord,
  traverseRuntype,
} from "util/runtypes.js";

const keyEmoji = "📁";
const valueEmoji = "📄";
const definedValueEmoji = "📝";
const newlyDefinedValueEmoji = "🆕";
const definedDefaultValueEmoji = "⚫";

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

const recursivePrint = async (
  runtype: Reflect,
  _path: string,
  lvl: number = 0
): Promise<{
  min: string;
  full: string;
}> => {
  const config = await getConfig();
  // const
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
        const inner = await recursivePrint(record, path, lvl + 1);
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
        const isDefault = await isDefaultValue(path, {
          baseNest: (c) => c.search.params,
        });
        const value = accessNestedProperty(config.search.params, path);
        if (isPresent && !isDefault) {
          const definedValue =
            `${prefix}${definedValueEmoji} ` +
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
              ? `️${definedDefaultValueEmoji} ` +
                `${key}: ${discordFormat(value, {
                  monospace: true,
                })} ${discordFormat(`(default value)`)}` +
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

const printSearchParams = async () => {
  const { min: _min, full: _full } = await recursivePrint(SearchParams, "");
  return {
    min: maxEmptyLines(_min, 1),
    full: maxEmptyLines(_full, 1),
  };
};

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
  toggleShowAll: "toggleShowAll",
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
  let configPrint = await printSearchParams();
  let lastConfigPrint = configPrint;

  return await constructAndSendRichMessage({
    customSendFn: (o) => commandInteraction.reply({ ...o, fetchReply: true }),
    embeds: [
      {
        title: "Your search",
        description: configPrint.min,
        color: editConfigColor,
      },
    ],
    initComponentOrder: [[ids.toggleShowAll, ids.toggleEdit]],
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
              apply,
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
                const uuid = `${ids.valueEditModal}-${option}-${Math.random()
                  .toString(36)
                  .substring(4)}`;
                await componentInteraction.showModal(
                  new ModalBuilder()
                    .setCustomId(uuid)
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

                // componentInteraction

                // Get the Modal Submit Interaction that is emitted once the User submits the Modal
                const submitted = await componentInteraction
                  .awaitModalSubmit({
                    // Timeout after a minute of not receiving any valid Modals
                    time: 60000,
                    // Make sure we only accept Modals from the User who sent the original componentInteraction we're responding to
                    filter: (i) =>
                      i.user.id === componentInteraction.user.id &&
                      i.isModalSubmit() &&
                      i.customId === uuid,
                  })
                  .catch((error) => {
                    // Catch any Errors that are thrown (e.g. if the awaitModalSubmit times out after 60000 ms)
                    console.error(error);
                    return null;
                  });

                await submitted?.deferUpdate().catch((e) => {
                  // TODO rewrite
                  console.log("deferUpdate error", e);
                });

                // const field = submitted?.fields.getField(ids.valueEditInput);
                if (!submitted) {
                  console.log("TODO rewrite thiss, there is no f");
                  return { state, componentOrder };
                }

                const { ...config } = await getConfig();
                // modify the config:
                const v = castStringToRuntype(
                  f,
                  submitted.fields.getTextInputValue(ids.valueEditInput).trim()
                );

                const validation = f.validate(v);
                if (v === accessNestedProperty(config.search.params, newPath)) {
                  await discordWarning(
                    `No change detected`,
                    `The value for ${discordFormat(option, {
                      monospace: true,
                    })} is already set to ${discordFormat(`${v}`, {
                      monospace: true,
                    })}`,
                    {
                      customSendFn: (o) =>
                        submitted.followUp({
                          ...o,
                          fetchReply: true,
                        }),
                    }
                  );
                  configPrint = await printSearchParams();
                  getEmbed(0).setDescription(
                    state.showAll ? configPrint.full : configPrint.min
                  );
                } else if (validation.success) {
                  // validation.

                  modifyNestedProperty(config, "search.params" + newPath, v);
                  cache.config.writeValue(config);
                  lastConfigPrint = configPrint;
                  configPrint = await printSearchParams().then((prints) =>
                    Object.entries(prints).reduce(
                      (acc, [_key, print]) => {
                        let newValuesCount = 0;
                        const key = _key as keyof typeof configPrint;
                        acc[key] = print.split("\n").reduce((acc, line, i) => {
                          const oldLine =
                            lastConfigPrint[key].split("\n")[
                              i + newValuesCount
                            ];
                          if (oldLine !== undefined && line !== oldLine) {
                            acc +=
                              line.replace(
                                definedValueEmoji,
                                newlyDefinedValueEmoji
                              ) + "\n";
                            if (!line.split(":")[0]?.includes(option)) {
                              newValuesCount++;
                            }
                          } else {
                            acc += line + "\n";
                          }
                          return acc;
                        });
                        return acc;
                      },
                      { ...configPrint }
                    )
                  );

                  getEmbed(0).setDescription(
                    state.showAll ? configPrint.full : configPrint.min
                  );

                  await constructAndSendRichMessage({
                    embeds: [
                      {
                        title: "⚙️ Search parameters updated",
                        description: `${userMention(
                          submitted.user.id
                        )} changed ${discordFormat(option, {
                          monospace: true,
                        })} to ${discordFormat(`${v}`, { monospace: true })}`,
                        color: successColor,
                      },
                    ],
                  });
                } else {
                  await discordWarning(
                    `Invalid value ${discordFormat(v, {
                      monospace: true,
                    })} for ${discordFormat(option, {
                      monospace: true,
                    })}:`,
                    validation.message,
                    {
                      error: true,
                      customSendFn: (o) =>
                        submitted.followUp({ ...o, fetchReply: true }),
                    }
                  );
                }

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
          [ids.toggleShowAll]: {
            label: "🧩",
            mutate: ({ state, getEmbed, getButton, componentOrder }) => {
              const b = getButton(ids.toggleShowAll);
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
            // style: ButtonStyle.Danger,
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
