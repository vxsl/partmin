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
}: {
  commandInteraction?: CommandInteraction;
  prompt?: string;
  name: string;
  doneButton?: boolean;
}): Promise<string | InteractiveMessageCancel | InteractiveMessageDone> => {
  const prompt =
    customPrompt ??
    discordFormat(
      `Use the ${
        stringPromptLabels.edit
      } button below to set the desired ${name.toLowerCase()}.`,
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
                      )} provided a value for "${name.toLowerCase()}": ${discordFormat(
                        `${value}`,
                        {
                          monospace: true,
                        }
                      )}`,
                      { italic: true }
                    )
                  )
                  .setColor(secondaryColor);

                return { state, componentOrder: [] };
              },
            },
            [ids.cancel]: {
              style: ButtonStyle.Danger,
              label: stringPromptLabels.cancel,
              mutate: ({ componentInteraction, state, getEmbed }) => {
                resolve(interactiveMessageCancel);

                getEmbed(0)
                  .setDescription(
                    discordFormat(`${prompt}`, {
                      quote: true,
                      italic: true,
                    }) +
                      "\n" +
                      discordFormat(
                        `${userMention(
                          componentInteraction.user.id
                        )} cancelled the operation.`,
                        { italic: true }
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
                      discordFormat(`${prompt}`, {
                        quote: true,
                        italic: true,
                      }) +
                        "\n" +
                        discordFormat(
                          `${userMention(
                            componentInteraction.user.id
                          )} finished the operation.`,
                          { italic: true }
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
      async ({ componentInteraction, getEmbed }: ComponentContext<any>) => {
        resolve(key === "true");

        getEmbed(0)
          .setDescription(
            discordFormat(prompt, { quote: true, italic: true }) +
              "\n" +
              discordFormat(
                `${userMention(componentInteraction.user.id)} answered "${
                  stringPromptLabels[key]
                }"`,
                { italic: true }
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
                    discordFormat(`${prompt}`, {
                      quote: true,
                      italic: true,
                    }) +
                      "\n" +
                      discordFormat(
                        `${userMention(
                          componentInteraction.user.id
                        )} cancelled the operation.`,
                        { italic: true }
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
