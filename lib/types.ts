import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";


export type RegisterUserParams = {
  email: string;
  username: string;
  credential: RegistrationResponseJSON;
  challenge: string;
};

export type LoginUserParams = {
  email: string;
  credential: AuthenticationResponseJSON;
  challenge: string;
};

