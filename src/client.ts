import {
  APIApplicationCommandInteraction,
  InteractionResponseType,
  InteractionType,
  APIPingInteraction,
  APIMessageComponentInteraction,
  APIModalSubmitInteraction,
  APIInteractionResponse,
  APIApplicationCommandAutocompleteInteraction,
} from "discord-api-types/v10";
import { verify } from "./verify";
import { Collection } from "@discordjs/collection";
import {
  Command,
  Commands,
  ICommands,
  reply,
  SlashCommandOption,
  UserOrMessageCommandOption,
} from "./commands";
import { Component, ComponentHandler, Components } from "./components";

class Client<T extends Env, C extends object> {
  commands: Commands<T, C>;
  commandFunctions: ICommands;
  components: Components<T, C>;
  componentsFunction: Collection<ComponentHandler, Component>;
  env: T;
  clientId: string;
  config: C;
  constructor(env: T, config: C) {
    this.commandFunctions = {};
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
      _target: Object,
      name: string,
      descriptor: PropertyDescriptor
    ) {
      const fn = descriptor.value as Command;
      if (args.type === 2 || args.type === 3) {
        fn.type = args.type;
        fn.name_localizations = args.name_localizations;
        self.commandFunctions[args.name] = fn;
      } else if (args.type === 1) {
        if (args.options) fn.options = args.options;
        fn.type = 1;
        fn.description = args.description;
        fn.description_localizations = args.description_localizations;
        self.commandFunctions[name] = fn;
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
        return respond(
          await this.commandFunctions[interaction.data.name](interaction)
        );
      case InteractionType.ApplicationCommandAutocomplete:
        let choices =
          this.commandFunctions[interaction.data.name].options
            ?.filter((x) =>
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
        const component = this.componentsFunction.find((_, h) => h(interaction));
        if (component) {
          return respond(await component(interaction));
        }
      default:
        return respond(reply("hi"));
    }
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
