import { parseTarget, parsePoints } from "../util/args";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";
import { inc, updateUser } from "../util/userUtil";

const give = textCommand({
    name: 'give',
    category: 'pointGain',
    description: 'Give points to player',
    expectedArgs: '<users @> <number>',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '3s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
}, async (ctx) => {
    const gifteeId = await parseTarget(ctx.args[0], ctx, {selfReply: 'Yourself? So kind...'})
    if (gifteeId === undefined) {
        return
    }

    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        const points = await parsePoints(ctx.args[1], user, ctx.message, 'gift')
        if (points === undefined) {
            return
        }

        const author = await updateUser(user.id, {points: inc(-points), pointsGiven: inc(points)}, {...ctx.origin, reason: "giftSent"})
        await updateUser(gifteeId, {points: inc(points), pointsRecieved: inc(points)}, {...ctx.origin, reason: "giftReceived"})
        await ctx.message.reply({content: `You gave <@${gifteeId}> ${points} points ${process.env.NICE_EMOJI} You now have ${author.points} points`})
    })
})

export default give
