import { claimByName, claimNames, isClaimName } from "../util/claimUtil";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const claim = textCommand({
    name: 'claim',
    category: 'claim stuff',
    description: 'claim points',
    expectedArgs: '<type to claim>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '3s',
}, async (ctx) => {
    const claimName = ctx.args[0].toLowerCase()
    if (!isClaimName(claimName)) {
        await ctx.message.reply({content: `${ctx.args[0]} ain a valid claim. Types: \n\`\`\`${claimNames().join(', ')}\`\`\``})
        return
    }

    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        await claimByName(user, ctx.message, claimName, ctx.origin)
    })
})

export default claim
