import { Guild, Message, TextChannel } from "discord.js"
import { ICallback, ICommand } from "../wokTypes"
import * as dotenv from "dotenv"
dotenv.config()

export interface ITextContext {
    message: Message<boolean>
    channel: TextChannel
    args: string[]
    guild: Guild
    authorId: string
}

const textCommand = (
    spec: Omit<ICommand, 'callback'>,
    run: (ctx: ITextContext) => Promise<void>
): ICommand => ({
    ...spec,
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (message.channel.type !== "GUILD_TEXT") {
            await message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        await run({
            message: message,
            channel: message.channel as TextChannel,
            args: args,
            guild: guild,
            authorId: message.author.id
        }).catch((err) => console.log(err))
    }
})

export default textCommand
