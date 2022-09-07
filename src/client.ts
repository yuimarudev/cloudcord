import {
  APIApplicationCommandInteraction,
  InteractionResponseType,
  InteractionType,
  APIPingInteraction,
  APIMessageComponentInteraction,
  APIModalSubmitInteraction,
  APIInteractionResponse,
  APIApplicationCommandAutocompleteInteraction,
  APIMessage,
} from "discord-api-types/v10";
import { verify } from "./verify";
import { Collection } from "@discordjs/collection";
import {
  CallbackData,
  Command,
  Commands,
  reply,
  SlashCommandOption,
  UserOrMessageCommandOption,
} from "./commands";
import { Component, ComponentHandler, Components } from "./components";
const ParentClass = Symbol();

class Client<T extends Env, C extends object> {
  commands: Commands<T, C>;
  commandFunctions: Collection<string, Command>;
  components: Components<T, C>;
  componentsFunction: Collection<ComponentHandler, Component>;
  env: T;
  clientId: string;
  config: C;
  constructor(env: T, config: C) {
    this.commandFunctions = new Collection();
    this.componentsFunction = new Collection();
    this.env = env;
    this.clientId = atob(env.token.split(".")[0]);
    this.config = config;
    this.commands = new Commands(env.token, this.clientId, this);
    this.components = new Components(this);
  }

  command(args: SlashCommandOption | UserOrMessageCommandOption) {
    const self = this;
    return function (
      target: Object,
      name: string,
      descriptor: PropertyDescriptor
    ) {
      const fn = descriptor.value as Command;
      // @ts-ignore
      fn[ParentClass] = target;
      if (args.type === 2 || args.type === 3) {
        fn.type = args.type;
        fn.name_localizations = args.name_localizations;
        self.commandFunctions.set(args.name, fn);
      } else if (args.type === 1) {
        if (args.options) fn.options = args.options;
        if (args.default_member_permissions) fn.default_member_permissions = args.default_member_permissions;
        fn.type = 1;
        fn.description = args.description;
        fn.description_localizations = args.description_localizations;
        self.commandFunctions.set(name, fn);
      }
    };
  }

  component(handler: ComponentHandler) {
    const self = this;
    return function (
      _target: Object,
      _name: string,
      descriptor: PropertyDescriptor
    ) {
      self.componentsFunction.set(handler, descriptor.value as Component);
    };
  }

  async request(request: Request): Promise<Response> {
    if (
      !request.headers.get("X-Signature-Ed25519") ||
      !request.headers.get("X-Signature-Timestamp") ||
      !(await verify(request, this.env.publicKey))
    )
      return new Response("", { status: 401 });
    const interaction = (await request.json()) as
      | APIPingInteraction
      | APIApplicationCommandInteraction
      | APIApplicationCommandAutocompleteInteraction
      | APIMessageComponentInteraction
      | APIModalSubmitInteraction;
    switch (interaction.type) {
      case InteractionType.Ping:
        return respond({
          type: InteractionResponseType.Pong,
        });
      case InteractionType.ApplicationCommand:
        const command = this.commandFunctions.get(interaction.data.name);
        if (!command) throw new Error("Command not found");
        // @ts-ignore
        return respond(await command.bind(command[ParentClass])(interaction));
      case InteractionType.ApplicationCommandAutocomplete:
        const choices =
          this.commandFunctions
            .get(interaction.data.name)
            ?.options?.filter((x) =>
              interaction.data.options.find(
                (y) => x.name === y.name && x.type === y.type
              )
            )
            .map((x) => x.autoComplete) || [];
        // なぜかエラーが出ているが気にしないことにした。
        return respond({
          type: InteractionResponseType.ApplicationCommandAutocompleteResult,
          data: {
            choices,
          },
        });
      case InteractionType.MessageComponent:
        const component = this.componentsFunction.find((_, h) =>
          h(interaction)
        );
        if (!component) throw new Error("Component not found");
        return respond(await component(interaction));
      default:
        return respond(reply("hi"));
    }
  }

  async createMessage(
    channel: string,
    data: Omit<CallbackData, "ephemeral" | "supppress_embeds">
  ): Promise<APIMessage> {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(data));
    if (data.attachments)
      for (let attachment of data.attachments) {
        form.append(
          `files[${attachment.id}]`,
          attachment.data,
          attachment.filename
        );
      }
    return this.post(
      "channels/" + channel + "/messages",
      form
    ) as Promise<APIMessage>;
  }

  async post(route: string, data: FormData | object | string): Promise<Object> {
    let json = false;
    if (!(data instanceof FormData)) {
      data = JSON.stringify(data);
      json = true;
    }
    return fetch("https://discord.com/api/v10/" + route, {
      method: "POST",
      body: data,
      headers: {
        Authorization: "Bot " + this.env.token,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
    }).then(async (r) => r.json());
  }
  async delete(route: string): Promise<Object> {
    return fetch("https://discord.com/api/v10/" + route, {
      method: "DELETE",
      headers: {
        Authorization: "Bot " + this.env.token,
      },
    }).then(async (r) => r.json());
  }
  async get(route: string): Promise<Object> {
    return fetch("https://discord.com/api/v10/" + route, {
      headers: {
        Authorization: "Bot " + this.env.token,
      },
    }).then(async (r) => r.json());
  }
}

export function respond(
  interaction: FormData | APIInteractionResponse
): Response {
  let i: FormData;
  if (!(interaction instanceof FormData)) {
    let form = new FormData();
    form.append("payload_json", JSON.stringify(interaction));
    i = form;
  } else {
    i = interaction;
  }
  return new Response(i);
}

export function format(...r: string[]): string {
  return r.reduce(
    (a, c, i) => a?.replace(new RegExp(`\\{${i}\\}`, "g"), c),
    r.shift()
  ) as string;
}

export interface Env {
  publicKey: string;
  token: string;
}

export { Client };
