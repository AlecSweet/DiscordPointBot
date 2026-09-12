import { parseTarget } from "../util/args";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const points = textCommand({
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '3s',
}, async (ctx) => {
    const id = ctx.args[0] ? await parseTarget(ctx.args[0], ctx, {allowSelf: true}) : ctx.authorId
    if (id === undefined) {
        return
    }

    await withUserLock(id, ctx.message, async (user) => {
        await ctx.message.reply({content: ctx.args[0] ?
            `${ctx.args[0]} has ${user.points} points` :
            `You have ${user.points} points`})
    })
})

export default points
