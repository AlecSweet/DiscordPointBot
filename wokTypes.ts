/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ApplicationCommandOptionData,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  TextChannel,
  User,
  PermissionString,
} from 'discord.js'
import WOKCommands from 'WOKCommands'

export enum CommandErrors {
  EXCEPTION = 'EXCEPTION',
  COOLDOWN = 'COOLDOWN',
  INVALID_ARGUMENTS = 'INVALID ARGUMENTS',
  MISSING_PERMISSIONS = 'MISSING PERMISSIONS',
  MISSING_ROLES = 'MISSING ROLES',
  COMMAND_DISABLED = 'COMMAND DISABLED',
}

export type optionTypes =
  | 'SUB_COMMAND'
  | 'SUB_COMMAND_GROUP'
  | 'STRING'
  | 'INTEGER'
  | 'BOOLEAN'
  | 'USER'
  | 'CHANNEL'
  | 'ROLE'
  | 'MENTIONABLE'
  | 'NUMBER'

export interface ICallback {
  channel: TextChannel
  message: Message
  args: string[]
  text: string
  client: Client
  prefix: string
  instance: WOKCommands
  interaction: CommandInteraction
  options: ApplicationCommandOptionData[]
  user: User
  member: GuildMember
  guild: Guild
}

export interface IErrorObject {
  error: CommandErrors
  command: string
  message: Message
  info: object
}

export interface ICommand {
  name?: string
  aliases?: string[] | string
  category: string
  description: string
  callback?(obj: ICallback): any
  error?(obj: IErrorObject): any
  minArgs?: number
  maxArgs?: number
  syntaxError?: string//{ [key: string]: string }
  expectedArgs?: string
  expectedArgsTypes?: optionTypes[]
  syntax?: string
  requiredPermissions?: PermissionString[]
  permissions?: PermissionString[]
  cooldown?: string
  globalCooldown?: string
  ownerOnly?: boolean
  hidden?: boolean
  guildOnly?: boolean
  testOnly?: boolean
  slash?: boolean | 'both'
  options?: ApplicationCommandOptionData[]
  requireRoles?: boolean
}