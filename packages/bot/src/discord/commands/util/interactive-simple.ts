import {
  ButtonStyle,
  CommandInteraction,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} from "discord.js";
import { primaryColor, secondaryColor } from "discord/constants.js";
import {
  ComponentContext,
  componentGroup,
  constructAndSendRichMessage,
} from "discord/interactive/index.js";
import { stringModal } from "discord/interactive/modal.js";
import { discordSend } from "discord/util.js";
import { log } from "util/log.js";
import { discordFormat } from "util/string.js";

const ids = {
  edit: "edit",
  true: "true",
  false: "false",
  cancel: "cancel",
  done: "done",
};
export const stringPromptLabels: { [key in keyof typeof ids]: string } = {
  edit: "✏️",
  true: "✅",
  false: "❌",
  cancel: "Cancel",
  done: "Done",
};

export const interactiveMessageCancel = Symbol("cancel");
export type InteractiveMessageCancel = typeof interactiveMessageCancel;
export const interactiveMessageDone = Symbol("done");
export type InteractiveMessageDone = typeof interactiveMessageDone;

export const promptForString = ({
  name,
  prompt: customPrompt,
  commandInteraction,
  doneButton,
  hideValue,
  required,
  requiredMessage,
}: {
  commandInteraction?: CommandInteraction;
  prompt?: string;
  name: string;
  doneButton?: boolean;
  hideValue?: boolean;
  required?: boolean;
  requiredMessage?: string;
}): Promise<string | InteractiveMessageCancel | InteractiveMessageDone> => {
  const prompt =
    customPrompt ??
    discordFormat(
      `Use the ${stringPromptLabels.edit} button below to set the desired "${name}".`,
      { bold: true }
    );
  return new Promise((resolve, reject) =>
    constructAndSendRichMessage({
      ...(commandInteraction && {
        customSendFn: (o) =>
          commandInteraction.reply({ ...o, fetchReply: true }).catch((e) => {
            log(e);
            return commandInteraction.followUp({ ...o, fetchReply: true });
          }),
      }),
      embeds: [{ description: prompt, color: primaryColor }],
      initComponentOrder: [
        [ids.edit, ids.cancel, ...(doneButton ? [ids.done] : [])],
      ],
      componentGroupDefs: {
        edit: componentGroup<{}>({
          initState: () => ({}),
          buttons: {
            [ids.edit]: {
              label: stringPromptLabels.edit,
              mutate: async ({ componentInteraction, state, getEmbed }) => {
                const { submitted, value } = await stringModal({
                  textInputBuilder: new TextInputBuilder()
                    .setLabel(name)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
                  modalTitle: "Please enter a value.",
                  componentInteraction,
                });

                resolve(value);

                getEmbed(0)
                  .setDescription(
                    discordFormat(
                      `${userMention(
                        submitted.user.id
                      )} provided a value for "${name}"${
                        hideValue
                          ? "."
                          : `: ${discordFormat(`${value}`, {
                              monospace: true,
                            })}`
                      }`,
                      { bold: true }
                    )
                  )
                  .setColor(secondaryColor);

                return { state, componentOrder: [] };
              },
            },
            [ids.cancel]: {
              style: ButtonStyle.Danger,
              label: stringPromptLabels.cancel,
              mutate: async ({ componentInteraction, state, getEmbed }) => {
                if (required) {
                  await discordSend(
                    requiredMessage ?? `"${name}" is required to proceed.`
                  );
                  return null;
                }

                resolve(interactiveMessageCancel);

                getEmbed(0)
                  .setDescription(
                    discordFormat(prompt.replace(/\*/g, ""), {
                      quote: true,
                      italic: true,
                    }) +
                      "\n\n" +
                      discordFormat(
                        `${userMention(
                          componentInteraction.user.id
                        )} cancelled the operation.`,
                        { bold: true }
                      )
                  )
                  .setColor(secondaryColor);

                return { state, componentOrder: [] };
              },
            },
            ...(doneButton && {
              [ids.done]: {
                style: ButtonStyle.Primary,
                label: stringPromptLabels.done,
                mutate: ({ componentInteraction, state, getEmbed }) => {
                  resolve(interactiveMessageDone);

                  getEmbed(0)
                    .setDescription(
                      discordFormat(prompt.replace(/\*/g, ""), {
                        quote: true,
                        italic: true,
                      }) +
                        "\n\n" +
                        discordFormat(
                          `${userMention(
                            componentInteraction.user.id
                          )} finished the operation.`,
                          { bold: true }
                        )
                    )
                    .setColor(secondaryColor);

                  return { state, componentOrder: [] };
                },
              },
            }),
          },
        }),
      },
    }).catch(reject)
  );
};

export const promptForRequiredString = async (
  args: Parameters<typeof promptForString>[0]
) => {
  while (true) {
    const s = (await promptForString({ ...args, required: true })) as string; // TODO no cast
    if (s.trim() === "") {
      await discordSend("The value you provided is empty. Please try again.");
      continue;
    }
    return s;
  }
};

export const promptForNumber = async (
  args: Parameters<typeof promptForString>[0]
) => {
  while (true) {
    const s = await promptForString(args);
    if (s === interactiveMessageCancel || s === interactiveMessageDone) {
      return s;
    }

    const n = Number(s);
    if (isNaN(n)) {
      await discordSend(
        "The value you provided doesn't appear to be a number. Please try again."
      );
      continue;
    }
    return n;
  }
};

export const promptForRequiredNumber = async (
  args: Parameters<typeof promptForNumber>[0]
) => {
  return (await promptForNumber({ ...args, required: true })) as Number;
};

export const promptForBoolean = ({
  commandInteraction,
  prompt,
}: {
  commandInteraction?: CommandInteraction;
  prompt: string;
}): Promise<boolean | InteractiveMessageCancel> =>
  new Promise((resolve, reject) => {
    const getCallback =
      (key: "false" | "true") =>
      ({ componentInteraction, getEmbed }: ComponentContext<any>) => {
        resolve(key === "true");

        getEmbed(0)
          .setDescription(
            discordFormat(prompt.replace(/\*/g, ""), {
              quote: true,
              italic: true,
            }) +
              "\n\n" +
              discordFormat(
                `${userMention(componentInteraction.user.id)} answered "${
                  stringPromptLabels[key]
                }"`,
                { bold: true }
              )
          )
          .setColor(secondaryColor);

        return { state: {}, componentOrder: [] };
      };

    constructAndSendRichMessage({
      ...(commandInteraction && {
        customSendFn: (o) =>
          commandInteraction.reply({ ...o, fetchReply: true }).catch((e) => {
            log(e);
            return commandInteraction.followUp({ ...o, fetchReply: true });
          }),
      }),
      embeds: [{ description: prompt, color: primaryColor }],
      initComponentOrder: [[ids.false, ids.true, ids.cancel]],
      componentGroupDefs: {
        edit: componentGroup({
          initState: () => ({}),
          buttons: {
            [ids.false]: {
              label: stringPromptLabels.false,
              mutate: getCallback("false"),
            },
            [ids.true]: {
              label: stringPromptLabels.true,
              mutate: getCallback("true"),
            },
            [ids.cancel]: {
              style: ButtonStyle.Danger,
              label: stringPromptLabels.cancel,
              mutate: ({ componentInteraction, state, getEmbed }) => {
                resolve(interactiveMessageCancel);

                getEmbed(0)
                  .setDescription(
                    discordFormat(prompt.replace(/\*/g, ""), {
                      quote: true,
                      italic: true,
                    }) +
                      "\n\n" +
                      discordFormat(
                        `${userMention(
                          componentInteraction.user.id
                        )} cancelled the operation.`,
                        { bold: true }
                      )
                  )
                  .setColor(secondaryColor);

                return { state, componentOrder: [] };
              },
            },
          },
        }),
      },
    }).catch(reject);
  });

export const promptForSubmit = ({
  commandInteraction,
  prompt,
}: {
  commandInteraction?: CommandInteraction;
  prompt: string;
}): Promise<true> =>
  new Promise((resolve, reject) =>
    constructAndSendRichMessage({
      ...(commandInteraction && {
        customSendFn: (o) =>
          commandInteraction.reply({ ...o, fetchReply: true }).catch((e) => {
            log(e);
            return commandInteraction.followUp({ ...o, fetchReply: true });
          }),
      }),
      embeds: [{ description: prompt, color: primaryColor }],
      initComponentOrder: [[ids.false, ids.true, ids.cancel]],
      componentGroupDefs: {
        edit: componentGroup({
          initState: () => ({}),
          buttons: {
            [ids.true]: {
              label: stringPromptLabels.true,
              mutate: ({ componentInteraction, state, getEmbed }) => {
                resolve(true);

                getEmbed(0)
                  .setDescription(
                    discordFormat(prompt.replace(/\*/g, ""), {
                      quote: true,
                      italic: true,
                    }) +
                      "\n\n" +
                      discordFormat(
                        `${userMention(
                          componentInteraction.user.id
                        )} finished the operation.`,
                        { bold: true }
                      )
                  )
                  .setColor(secondaryColor);

                return { state, componentOrder: [] };
              },
            },
          },
        }),
      },
    }).catch(reject)
  );
