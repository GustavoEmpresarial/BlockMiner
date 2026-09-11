/** Public surface of the client auth module — mirrors server/modules/auth/index.ts's
 *  "index.ts is the only import boundary" convention. Login and register are still separate
 *  flows internally (different validation, different business rules) — this just groups them
 *  the way the server already does (server/modules/auth/{login,register,google,satspay}). */
export { LoginPage } from './login';
export { RegisterPage } from './register';
export { GoogleSignInButton } from './GoogleSignInButton';
export { SatspaySignInButton } from './SatspaySignInButton';
