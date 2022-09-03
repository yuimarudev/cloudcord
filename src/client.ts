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
import {} from "@discordjs/builders";
import {
  Command,
  Commands,
  ICommands,
  reply,
  SlashCommandOption,
  UserOrMessageCommandOption,
} from "./commands";

class Client<T extends Env, C extends object> {
  commands: Commands<T, C>;
  commandFunctions: ICommands;
  env: T;
  clientId: string;
  config: C;
  constructor(env: T, config: C) {
    this.commandFunctions = {};
    this.env = env;
    this.clientId = atob(env.token.split(".")[0]);
    this.config = config;
    this.commands = new Commands(config, env.token, this.clientId, this);
  }

  command(args: SlashCommandOption | UserOrMessageCommandOption) {
    let self = this;
    return function (
      _target: Object,
      name: string,
      descriptor: PropertyDescriptor
    ) {
      let fn = descriptor.value as Command;
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
        switch (interaction.data.component_type) {
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
