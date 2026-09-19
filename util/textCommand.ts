import { Guild, Message, TextChannel } from "discord.js"
import { ICallback, ICommand } from "../wokTypes"
import { IPointOrigin } from "../db/pointEvent"
import { isShuttingDown } from "./shuttingDown"
import * as dotenv from "dotenv"
dotenv.config()

export interface ITextContext {
    message: Message<boolean>
    channel: TextChannel
    args: string[]
    guild: Guild
    authorId: string
    origin: IPointOrigin
}

const textCommand = (
    spec: Omit<ICommand, 'callback'>,
    run: (ctx: ITextContext) => Promise<void>
): ICommand => ({
    ...spec,
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (isShuttingDown()) {
            await message.reply({content: `Restarting, try that again in a minute ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (message.channel.type !== "GUILD_TEXT") {
            await message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        await run({
            message: message,
            channel: message.channel as TextChannel,
            args: args,
            guild: guild,
            authorId: message.author.id,
            origin: {command: spec.name, messageId: message.id},
        }).catch((err) => console.log(err))
    }
})

export default textCommand
