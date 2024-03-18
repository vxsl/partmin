import {
  ButtonStyle,
  CommandInteraction,
  SelectMenuComponentOptionData,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} from "discord.js";
import { editColor, successColor } from "discord/constants.js";
import {
  componentGroup,
  constructAndSendRichMessage,
} from "discord/interactive/index.js";
import { stringModal } from "discord/interactive/modal.js";
import { discordWarning } from "discord/util.js";
import { Reflect, ValidationError } from "runtypes";
import { accessNestedProperty, modifyNestedProperty } from "util/json.js";
import { log } from "util/log.js";
import { nonEmptyArrayOrError, notUndefined } from "util/misc.js";
import {
  castStringToRuntype,
  getRecord,
  getRuntypeDescription,
  recursivePrintRuntype,
  traverseRuntype,
} from "util/runtypes.js";
import { discordFormat, maxEmptyLines } from "util/string.js";
import { RecursivePartial } from "util/type.js";

export const interactiveEditLabels = {
  key: "📁",
  value: "📄",
  toggleEdit: "⚙️",
  upOneLevel: "⬆️",
  toggleShowAll: "🧩",
};

const getSelectOptions = (
  _record: NonNullable<ReturnType<typeof getRecord>> | Reflect
): SelectMenuComponentOptionData[] => {
  const record = getRecord(_record);
  if (!record) {
    return [];
  }
  return Object.entries(record.fields).map(([k, _v]) => ({
    label: getRecord(_v)
      ? `${interactiveEditLabels.key} ${k}`
      : `${interactiveEditLabels.value} ${k}`,
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

const defaultEditPlaceholder = "select a value to edit";
const pathPlaceholder = (path: string) =>
  path.length > 1
    ? `${interactiveEditLabels.key} select a value from "${path}" to edit`
    : defaultEditPlaceholder;

export const interactiveEdit = async <T>({
  commandInteraction,
  getObject,
  writeObject,
  nestPath,
  runtype,
  defaultValues,
  strings,
  alwaysShowDefaultValues,
}: {
  alwaysShowDefaultValues?: boolean;
  commandInteraction?: CommandInteraction;
  getObject: () => Promise<T>;
  writeObject: (obj: T) => Promise<void>;
  nestPath?: string;
  runtype: Reflect;
  defaultValues: RecursivePartial<T>;
  strings: {
    title: string;
    description?: string;
    editModal: string;
    changeNotification: string;
  };
}) => {
  const printObject = async <T>({ lastObj }: { lastObj?: T } = {}) => {
    const obj = await getObject();
    const { min: _min, full: _full } = await recursivePrintRuntype({
      runtype,
      object: accessNestedProperty(obj, nestPath),
      lastObject: accessNestedProperty(lastObj, nestPath),
      defaultValues: accessNestedProperty(defaultValues, nestPath) ?? {},
      path: "",
    });

    const prefix = discordFormat(
      (alwaysShowDefaultValues
        ? ""
        : `Click ${interactiveEditLabels.toggleShowAll} to toggle display of default values\n`) +
        `Click ${interactiveEditLabels.toggleEdit} to edit values`,
      { italic: true }
    );
    return {
      min: maxEmptyLines(prefix + "\n\n" + _min, 1),
      full: maxEmptyLines(prefix + "\n\n" + _full, 1),
    };
  };

  let lastObj: T | undefined;
  let objPrint = await printObject();

  const getPrint = (options?: { full?: boolean }) =>
    [
      strings.description,
      alwaysShowDefaultValues || options?.full ? objPrint.full : objPrint.min,
    ]
      .filter(notUndefined)
      .join("\n");

  return await constructAndSendRichMessage({
    ...(commandInteraction && {
      customSendFn: (o) => commandInteraction.reply({ ...o, fetchReply: true }),
    }),
    embeds: [
      {
        title: strings.title,
        description: getPrint(),
        color: editColor,
      },
    ],
    initComponentOrder: [
      [...(alwaysShowDefaultValues ? [] : [ids.toggleShowAll]), ids.toggleEdit],
    ],
    componentGroupDefs: {
      edit: componentGroup<{
        showAll: boolean;
        edit: boolean;
        editPath: string;
      }>({
        initState: () => ({
          showAll: false,
          edit: false,
          editPath: "",
        }),
        buttons: {
          ...(!alwaysShowDefaultValues && {
            [ids.toggleShowAll]: {
              label: interactiveEditLabels.toggleShowAll,
              mutate: ({ state, getEmbed, getButton, componentOrder }) => {
                const b = getButton(ids.toggleShowAll);
                const e = getEmbed(0);
                if (state.showAll) {
                  e.setDescription(getPrint());
                  b.setStyle(ButtonStyle.Secondary);
                } else {
                  e.setDescription(getPrint({ full: true }));
                  b.setStyle(ButtonStyle.Primary);
                }
                return {
                  state: { ...state, showAll: !state.showAll },
                  componentOrder,
                };
              },
            },
          }),
          [ids.toggleEdit]: {
            label: interactiveEditLabels.toggleEdit,
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
            label: interactiveEditLabels.upOneLevel,
            mutate: ({ state, componentOrder, getStringSelect }) => {
              const newPath = state.editPath.split(".").slice(0, -1).join(".");
              const newLevel = newPath.split(".").length;
              const f = traverseRuntype(
                runtype,
                newPath.split(".").filter((s) => s !== "")
              );
              const record = getRecord(f);
              if (!record) {
                log(
                  `Error while trying to go up one level - record is undefined`
                );
                return null;
              }
              getStringSelect(ids.optionSelect)
                .setPlaceholder(pathPlaceholder(newPath))
                .setOptions(getSelectOptions(record));
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
        stringSelects: {
          [ids.optionSelect]: {
            placeholder: pathPlaceholder(""),
            options: getSelectOptions(runtype),
            mutate: async ({
              state,
              componentOrder,
              componentInteraction,
              getStringSelect,
              getEmbed,
            }) => {
              if (
                !(componentInteraction instanceof StringSelectMenuInteraction)
              ) {
                return null;
              }
              const component = getStringSelect(ids.optionSelect);
              const option = componentInteraction.values[0];
              if (option === undefined) {
                log(
                  `Something went wrong with the option select - option is undefined`
                );
                return null;
              }

              const newEditPath = [state.editPath, option]
                .filter((s) => s !== "")
                .join(".");
              const level = newEditPath.split(".").length;
              const field = traverseRuntype(
                runtype,
                newEditPath.split(".").filter((s) => s !== "")
              );

              const record = getRecord(field);
              if (record) {
                component
                  .setPlaceholder(pathPlaceholder(newEditPath))
                  .setOptions(getSelectOptions(record));
                return {
                  state: { ...state, editPath: newEditPath },
                  componentOrder:
                    level > 0
                      ? [
                          componentOrder[0]?.includes(ids.upOneLevel)
                            ? componentOrder[0]
                            : [...(componentOrder[0] ?? []), ids.upOneLevel],
                          ...componentOrder.slice(1),
                        ]
                      : componentOrder,
                };
              }

              const isOptional = field.tag === "optional";

              const { submitted, value } = await stringModal({
                modalTitle: strings.editModal,
                componentInteraction,
                uuidPrefix: `${ids.valueEditModal}-${option}`,
                textInputBuilder: new TextInputBuilder()
                  .setLabel(option)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(!isOptional)
                  .setPlaceholder(
                    `enter ${[
                      getRuntypeDescription(field, {
                        omitOptional: true,
                        useArticle: true,
                      }),
                      isOptional ? ", or leave blank" : undefined,
                    ]
                      .filter(notUndefined)
                      .join("")}`
                  ),
              }).catch();

              if (!submitted) {
                return null;
              }

              const { ...obj } = await getObject();
              const v = castStringToRuntype(field, value);

              if (
                v ===
                accessNestedProperty(
                  obj,
                  [nestPath, newEditPath].filter(notUndefined).join(".")
                )
              ) {
                await discordWarning(
                  "No change",
                  `${discordFormat(option, {
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
                objPrint = await printObject();
                getEmbed(0).setDescription(getPrint({ full: state.showAll }));
                return null;
              }

              try {
                lastObj = JSON.parse(JSON.stringify(obj));
                const newObj = JSON.parse(JSON.stringify(obj));
                modifyNestedProperty(
                  newObj,
                  [nestPath, newEditPath].filter(notUndefined).join("."),
                  v
                );
                await writeObject(newObj);

                objPrint = await printObject({ lastObj });
                getEmbed(0).setDescription(getPrint({ full: state.showAll }));

                await constructAndSendRichMessage({
                  embeds: [
                    {
                      title: strings.changeNotification,
                      description: `${userMention(
                        submitted.user.id
                      )} changed ${discordFormat(newEditPath, {
                        monospace: true,
                      })} to ${discordFormat(`${v}`, { monospace: true })}`,
                      color: successColor,
                    },
                  ],
                });
              } catch (e) {
                if (e instanceof ValidationError) {
                  await discordWarning(
                    `Invalid value ${discordFormat(`${v}`, {
                      monospace: true,
                    })} for ${discordFormat(option, {
                      monospace: true,
                    })}:`,
                    `${accessNestedProperty(
                      accessNestedProperty(e.details, nestPath),
                      newEditPath
                    )}`,
                    {
                      error: true,
                      customSendFn: (o) =>
                        submitted.followUp({ ...o, fetchReply: true }),
                    }
                  );
                } else {
                  await discordWarning(
                    `An error occurred while updating ${discordFormat(
                      newEditPath,
                      { monospace: true }
                    )}`,
                    e,
                    {
                      error: true,
                      customSendFn: (o) =>
                        submitted.followUp({ ...o, fetchReply: true }),
                    }
                  );
                }
              }

              return null;
            },
          },
        },
      }),
    },
  });
};
