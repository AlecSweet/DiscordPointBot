import ephemeralButton from "../util/ephemeralButton";
import textCommand from "../util/textCommand";
import { mintLink } from "../web/webSession";

const linkPanel = (link: string | undefined): string => link === undefined
    ? `Not set up`
    : `<${link}>\nOne use link that lasts 10 minutes; opening it will keep that browser signed in for a while.\n\nIt will not give you a virus ${process.env.PEEPO_COMFY_EMOJI}`

const history = textCommand({
    name: 'history',
    category: 'statCheck',
    description: 'Open point history',
    minArgs: 0,
    maxArgs: 0,
    cooldown: '5s',
}, async (ctx) => {
    await ephemeralButton(ctx.message, {
        title: `**Point History**`,
        label: `Get Point History Link`,
        build: async (replyTo, userId) => ({content: linkPanel(mintLink(userId))})
    })
})

export default history
