import { claimWeekly } from "../util/claimUtil";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const weekly = textCommand({
    name: 'weekly',
    category: 'claim weekly',
    description: 'claim points',
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        await claimWeekly(user, ctx.message)
    })
})

export default weekly
