import { Client, Env } from "./client";
import {
  APIInteractionResponse,
  APIMessageComponentInteraction
} from "discord-api-types/v10";

class Components<T extends Env, C extends object> {
  constructor(client: Client<T, C>) {}
}

export { Components };

export interface ComponentHandler {
  (interaction: APIMessageComponentInteraction): boolean;
}

export interface Component {
  (interaction: APIMessageComponentInteraction): Promise<APIInteractionResponse>;
}