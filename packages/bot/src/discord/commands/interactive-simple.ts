import {
  CommandInteraction,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} from "discord.js";
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
};
const emojis: { [key in keyof typeof ids]: string } = {
  edit: "✏️",
  true: "✅",
  false: "❌",
};

export const promptForString = ({
  name,
  prompt: customPrompt,
  commandInteraction,
}: {
  commandInteraction?: CommandInteraction;
  prompt?: string;
  name: string;
}): Promise<string> => {
  const prompt =
    customPrompt ??
    `Use the button below to set the desired ${name.toLowerCase()}`;
  return new Promise((resolve, reject) =>
    constructAndSendRichMessage({
      ...(commandInteraction && {
        customSendFn: (o) =>
          commandInteraction.reply({ ...o, fetchReply: true }).catch((e) => {
            log(e);
            return commandInteraction.followUp({ ...o, fetchReply: true });
          }),
      }),
      content: discordFormat(`${prompt}:`, { bold: !prompt.includes("\n") }),
      initComponentOrder: [[ids.edit]],
      componentGroupDefs: {
        edit: componentGroup<{}>({
          initState: () => ({}),
          buttons: {
            [ids.edit]: {
              label: emojis.edit,
              mutate: async ({ componentInteraction, state }) => {
                const { submitted, value } = await stringModal({
                  textInputBuilder: new TextInputBuilder()
                    .setLabel(name)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
                  modalTitle: "Please enter a value.",
                  componentInteraction,
                });

                resolve(value);

                await componentInteraction.message.edit({
                  content:
                    discordFormat(`${prompt}`, {
                      quote: true,
                      italic: true,
                    }) +
                    "\n" +
                    discordFormat(
                      `${userMention(
                        submitted.user.id
                      )} provided a value for "${name.toLowerCase()}": ${discordFormat(
                        `${value}`,
                        {
                          monospace: true,
                        }
                      )}`,
                      { bold: true }
                    ),
                });
                return { state, componentOrder: [] };
              },
            },
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
}): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const getCallback =
      (key: "false" | "true") =>
      async ({ componentInteraction }: ComponentContext<any>) => {
        resolve(key === "true");
        await componentInteraction.message.edit({
          content:
            discordFormat(`${prompt}`, {
              quote: true,
              italic: true,
            }) +
            "\n" +
            discordFormat(
              `${userMention(componentInteraction.user.id)} answered "${
                emojis[key]
              }"
                      `,
              { bold: true }
            ),
        });
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
      content: discordFormat(prompt, { bold: true }),
      initComponentOrder: [[ids.false, ids.true]],
      componentGroupDefs: {
        edit: componentGroup({
          initState: () => ({}),
          buttons: {
            [ids.false]: {
              label: emojis.false,
              mutate: getCallback("false"),
            },
            [ids.true]: {
              label: emojis.true,
              mutate: getCallback("true"),
            },
          },
        }),
      },
    }).catch(reject);
  });
