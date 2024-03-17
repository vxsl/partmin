import {
  ActionRowBuilder,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
} from "discord.js";
import { log } from "util/log.js";

export const stringModal = async ({
  textInputBuilder,
  uuidPrefix,
  modalTitle,
  componentInteraction,
  timeout = 120000,
}: {
  textInputBuilder: TextInputBuilder;
  uuidPrefix?: string;
  modalTitle: string;
  componentInteraction: MessageComponentInteraction;
  timeout?: number;
}) => {
  const uuid = (uuidPrefix ?? "") + Math.random().toString(36);
  const fieldID = `input-${uuid}`;

  await componentInteraction.showModal(
    new ModalBuilder()
      .setCustomId(uuid)
      .setTitle(modalTitle)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          textInputBuilder.setCustomId(fieldID)
        )
      )
  );

  let submitted: ModalSubmitInteraction | undefined;
  try {
    submitted = await componentInteraction.awaitModalSubmit({
      time: timeout,
      filter: (i) =>
        i.user.id === componentInteraction.user.id &&
        i.isModalSubmit() &&
        i.customId === uuid,
    });
  } catch (e) {
    log("Error while awaiting modal submit");
    log(e);
    throw e;
  }

  if (!submitted) {
    log("No submitted modal");
    throw new Error("No submitted modal");
  }

  await submitted.deferUpdate().catch((e) => {
    log("error while deferring update");
    log(e);
  });

  return {
    submitted,
    value: submitted.fields.getTextInputValue(fieldID).trim(),
  };
};
