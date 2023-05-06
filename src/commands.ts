import {
  APIApplicationCommandInteraction,
  InteractionResponseType,
  APIInteractionResponseCallbackData,
  LocaleString,
  APIAttachment,
  APIApplicationCommandInteractionDataOption,
} from "discord-api-types/v10";
import { Client, Env, format } from "./client";

class Commands<T extends Env, C extends object> {
  token: string;
  clientId: string;
  client: Client<T, C>;
  constructor(token: string, clientId: string, client: Client<T, C>) {
    this.token = token;
    this.clientId = clientId;
    this.client = client;
  }

  async register() {
    let i = this.client.commandFunctions.map((v, k) => {
      return { name: k, ...v };
    });
    return await this.client
      .put(`applications/${this.clientId}/commands`, i)
      .then(async (r) => await r.json())
      .catch((e) => e);
  }

  error(
    command: string,
    error: string,
    raw: C & { en: any },
    locale?: keyof typeof raw
  ): FormData {
    return reply({
      content: format(raw[locale || "en"][command].error!, error),
      ephemeral: true,
    });
  }

  toSupportedLocale(locale: LocaleString, raw: C) {
    let loc: string = locale;
    if (locale.startsWith("en-")) loc = "en";
    if (!Object.keys(raw).includes(loc)) return "en";
    return loc as keyof typeof raw;
  }
}

export function reply(data: CallbackData): FormData;
export function reply(data: string): FormData;
export function reply(data: CallbackData | string): FormData {
  const form = new FormData();
  if (typeof data === "string") {
    form.append(
      "payload_json",
      JSON.stringify({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: data,
        },
      })
    );
  } else {
    let flags = 0;
    if (data.ephemeral) flags = 1 << 6;
    if (data.supppress_embeds) flags = flags | (1 << 2);
    form.append(
      "payload_json",
      JSON.stringify({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags,
          ...data,
        },
      })
    );
    if (data.attachments)
      for (let attachment of data.attachments) {
        form.append(
          `files[${attachment.id}]`,
          attachment.data,
          attachment.filename
        );
      }
  }
  return form;
}

export type CallbackData = APIInteractionResponseCallbackData & {
  attachments?: (Pick<APIAttachment, "id" | "description"> &
    Pick<APIAttachment, "filename"> & { data: Blob })[];
} & { ephemeral?: boolean; supppress_embeds?: boolean };

export interface CommandOption {
  type: Number;
  description?: string;
  description_localizations?: Record<string, string>;
  name_localizations?: Record<string, string>;
  name?: string;
  options?: ({
    autoComplete: string | number;
  } & APIApplicationCommandInteractionDataOption)[];
  error?: string;
  default_member_permissions?: string;
}

export interface SlashCommandOption extends CommandOption {
  type: 1;
  description: string;
  description_localizations: Record<string, string>;
  options?: ({
    autoComplete: string | number;
  } & APIApplicationCommandInteractionDataOption)[];
  default_member_permissions?: string;
}

export interface UserOrMessageCommandOption extends CommandOption {
  type: 2 | 3;
  name_localizations: Record<string, string>;
  name: string;
}

export interface Command extends CommandOption {
  (i: APIApplicationCommandInteraction): Promise<FormData>;
}

export { Commands };
