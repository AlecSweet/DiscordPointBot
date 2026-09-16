import { Message, SnowflakeUtil } from "discord.js"
import { betFacts, challengeFact, gameCommand, gameOffer, IBetFact, IChallengeFact, IStakeLinks, linkBets, linkChallenges, linkStakes, observe, Observation, warFact } from "../scripts/observePointHistory"

const ESC = String.fromCharCode(27)

let failures = 0
let passes = 0

const AT = new Date("2023-05-01T12:00:00Z")

interface IFakeOptions {
    repliedUser?: string
    interactionUser?: string
    reference?: string
    id?: string
    at?: Date
    editedAt?: Date
    thread?: string
}

const fake = (content: string, options: IFakeOptions = {}) => ({
    id: options.id ?? "bot",
    channelId: options.thread ?? "channel",
    content: content,
    createdAt: options.at ?? AT,
    editedAt: options.editedAt ?? null,
    reference: options.reference ? {messageId: options.reference} : null,
    attachments: {find: () => undefined},
    mentions: {repliedUser: options.repliedUser ? {id: options.repliedUser} : null},
    interaction: options.interactionUser ? {user: {id: options.interactionUser}} : null
}) as unknown as Message<boolean>

const describe = (observation: Observation): string => {
    if (observation.kind === "change") {
        return `${observation.userId} ${observation.delta > 0 ? "+" : ""}${observation.delta} -> ${observation.balance} ${observation.reason}/${observation.command}@${observation.messageId}`
    }
    if (observation.kind === "allInRun") {
        return `${observation.userId} all in, ${observation.wins} wins -> ${observation.balance}@${observation.messageId}`
    }
    if (observation.kind === "stakeHeld") {
        return `${observation.userId} holds ${observation.amount} for ${observation.game}@${observation.messageId}`
    }
    if (observation.kind === "stakeReleased") {
        return `${observation.userId} gets the ${observation.game} stake back@${observation.messageId}`
    }
    return `${observation.userId} = ${observation.balance}@${observation.messageId}`
}

const summarize = (observations: Observation[]): string => observations.map(describe).join(" | ")

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const minutes = (count: number): Date => new Date(AT.getTime() + count * 60000)

const reply = {repliedUser: "111", reference: "cmd"}

const alternating = `**<@666>'s Flips**
\`\`\`ansi
Points: 1000 (0)   Flip: 4/4 (2-2)   Bet: 100

1) ✅ 1100
2) ❌ 1000
3) ✅ 1100
4) ❌ 1000
\`\`\`
:shruggers:`

const busted = `**<@999>'s Martinelli**
\`\`\`ansi
Points: 400 (${ESC}[0;31m-600${ESC}[0m)   Win: 1/5   Next Bet: 800

1) ✅ 100
2) ❌ 100  ❌ 200  ❌ 400
\`\`\`
You ain't got 800. Sit`

const scrolledLadder = `**<@999>'s Martinelli**
\`\`\`ansi
Points: 400 (${ESC}[0;31m-600${ESC}[0m)   Win: 1/5   Next Bet: 800

2) ❌ 100  ❌ 200  ❌ 400
\`\`\`
You ain't got 800. Sit`

const scrolledFlips = `**<@666>'s Flips**
\`\`\`ansi
Points: 1700 (${ESC}[0;32m+700${ESC}[0m)   Flip: 7/7 (7-0)   Bet: 100

3) ✅ 1300
4) ✅ 1400
5) ✅ 1500
6) ✅ 1600
7) ✅ 1700
\`\`\`
Up 700 points :nice:`

const tests: {name: string, message: Message<boolean>, record?: string, expected: string}[] = [
    {name: "a flip win is a change to the replied user with the balance it left",
        message: fake(`You won 50 points :nice: You've got 1234 points now. You rolled 200 of 256`, reply),
        expected: "111 +50 -> 1234 flip/flip@cmd"},
    {name: "a flip loss is a change down to the balance it left",
        message: fake(`:smodge: 50 points deleted, later. You're down to 900 points. You rolled 20 of 256`, reply),
        expected: "111 -50 -> 900 flip/flip@cmd"},
    {name: "a flip loss into the negatives keeps its sign",
        message: fake(`:smodge: 50 points deleted, later. You're down to -50 points. You rolled 20 of 256`, reply),
        expected: "111 -50 -> -50 flip/flip@cmd"},
    {name: "the 2022 flip wording still parses",
        message: fake(`You won 50 points  You've got 4321 points now. You rolled a 200`, reply),
        expected: "111 +50 -> 4321 flip/flip@cmd"},
    {name: "a gift moves points out of the giver and into the receiver, whose balance is unknown",
        message: fake(`You gave <@333> 20 points :nice: You now have 480 points`, reply),
        expected: "111 -20 -> 480 giftSent/give@cmd | 333 +20 -> null giftReceived/give@cmd"},
    {name: "a daily claim is a change with no known balance",
        message: fake(`You got your daily 30 :dogegejam:`, reply),
        expected: "111 +30 -> null dailyClaim/daily@cmd"},
    {name: "a yearly claim is filed under its own tier",
        message: fake(`You got your yearly 1920 :dogegejam:`, reply),
        expected: "111 +1920 -> null yearlyClaim/yearly@cmd"},
    {name: "points on yourself is a checkpoint",
        message: fake(`You have 500 points`, reply),
        expected: "111 = 500@cmd"},
    {name: "points on someone else is a checkpoint for them",
        message: fake(`<@222> has 700 points`, reply),
        expected: "222 = 700@cmd"},
    {name: "points on someone by raw id is a checkpoint for that id",
        message: fake(`123456789012345678 has 700 points`, reply),
        expected: "123456789012345678 = 700@cmd"},
    {name: "a rejected wager on a button is a checkpoint for whoever pressed it",
        message: fake(`You only got 5 :noppers:`, {interactionUser: "444"}),
        expected: "444 = 5@bot"},
    {name: "a stats reply is a checkpoint for the user in its title",
        message: fake(`**<@555>'s Stats**\n\`\`\`Ruby\nPoints          12,345\nActive          1 days / 2 hours / 3 minutes\n\`\`\``, reply),
        expected: "555 = 12345@cmd"},
    {name: "a war offer nobody answered is the challenger's whole balance already in escrow",
        message: fake(`<@111> wants a war  with <@222>, theres 750 points on the line <:pepo_shake:1>\nWar will be canceled <t:1:R>`),
        expected: "111 -750 -> 0 warEscrow/war@bot"},
    {name: "a partial bet refund is a change with the balance it left",
        message: fake(`<@111> got 20 points back <:smodge:1> and now has 30 points`),
        expected: "111 +20 -> 30 betPayout/bet@bot"},
    {name: "a winning bet is left for the bet linker, which knows the stake",
        message: fake(`<@111> won 150 points <:nice:1> and now has 650 points`),
        expected: ""},
    {name: "a bet that lost it all is a checkpoint",
        message: fake(`<@111> lost it all and now has 0 points <:smodge:1>`),
        expected: "111 = 0@bot"},
    {name: "a challenge result on its own is not a change",
        message: fake(`<@111> wins 50 points <:nice:1>`),
        expected: ""},
    {name: "a wager the user cannot cover says nothing",
        message: fake(`You ain't got 500. Sit`, reply),
        expected: ""},
    {name: "a you-shaped message with no reference is skipped",
        message: fake(`You have 500 points`),
        expected: ""},

    {name: "a flip panel turns each numbered line into a change from the one before",
        message: fake(alternating),
        expected: "666 = 1000@bot | 666 +100 -> 1100 flip/flip@bot | 666 -100 -> 1000 flip/flip@bot | 666 +100 -> 1100 flip/flip@bot | 666 -100 -> 1000 flip/flip@bot | 666 = 1000@bot"},
    {name: "flip lines that scrolled off are one flip from the start the final net gives to the first line still shown",
        message: fake(scrolledFlips),
        expected: "666 = 1000@bot | 666 +300 -> 1300 flip/flip@bot | 666 +100 -> 1400 flip/flip@bot | 666 +100 -> 1500 flip/flip@bot | 666 +100 -> 1600 flip/flip@bot | 666 +100 -> 1700 flip/flip@bot | 666 = 1700@bot"},
    {name: "without a net to start from, the first flip line still shown is only a checkpoint",
        message: fake(scrolledFlips.replace(/ \([^)]*\)/, "")),
        expected: "666 = 1300@bot | 666 +100 -> 1400 flip/flip@bot | 666 +100 -> 1500 flip/flip@bot | 666 +100 -> 1600 flip/flip@bot | 666 +100 -> 1700 flip/flip@bot | 666 = 1700@bot"},
    {name: "the attached flip record fills in the lines that scrolled off",
        message: fake(scrolledFlips),
        record: "1) ✅ 1100\n2) ✅ 1200\n3) ✅ 1300\n4) ✅ 1400\n5) ✅ 1500\n6) ✅ 1600\n7) ✅ 1700",
        expected: "666 = 1000@bot | 666 +100 -> 1100 flip/flip@bot | 666 +100 -> 1200 flip/flip@bot | 666 +100 -> 1300 flip/flip@bot | 666 +100 -> 1400 flip/flip@bot | 666 +100 -> 1500 flip/flip@bot | 666 +100 -> 1600 flip/flip@bot | 666 +100 -> 1700 flip/flip@bot | 666 = 1700@bot"},
    {name: "a busted flip-all run on the net panel doubles from its start and loses the lot",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 0     Net: ${ESC}[0;31m-300${ESC}[0m     Flip: 3 of 5
W: 2     L: 1

✅ ✅ ❌
\`\`\`
Sit`),
        expected: "888 = 300@bot | 888 +300 -> 600 flip/flip@bot | 888 +600 -> 1200 flip/flip@bot | 888 -1200 -> 0 flip/flip@bot | 888 = 0@bot"},
    {name: "a fixed-bet run on the net panel works its bet out from the net and the record",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 50     Net: ${ESC}[0;31m-100${ESC}[0m     Flip: 3 of 5
W: 1     L: 2

✅ ❌ ❌
\`\`\`
You ain't got 100. Sit`),
        expected: "888 = 150@bot | 888 +100 -> 250 flip/flip@bot | 888 -100 -> 150 flip/flip@bot | 888 -100 -> 50 flip/flip@bot | 888 = 50@bot"},
    {name: "a fixed-bet run that broke even cannot show its bet, so only its ends are kept",
        message: fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 1000     Net: 0     Flip: 2 of 2
W: 1     L: 1

✅ ❌
\`\`\`
2 flips, :shruggers:`),
        expected: "888 = 1000@bot | 888 = 1000@bot"},
    {name: "a 2023 flip-all run that made it through is rebuilt from its final balance",
        message: fake(`**<@777>'s Flips**
\`\`\`Ruby
Points: 80     Flips Left: 0

✅ ✅ ✅
\`\`\`
You made it through :peepo_comfy:`),
        expected: "777 +10 -> 20 flip/flip@bot | 777 +20 -> 40 flip/flip@bot | 777 +40 -> 80 flip/flip@bot | 777 = 80@bot"},
    {name: "a 2023 flip-all run that busted is handed to the builder with its wins, to stake from the balance before it",
        message: fake(`**<@777>'s Flips**
\`\`\`Ruby
Points: 0     Flips Left: 2

✅ ✅ ❌
\`\`\`
Sit`),
        expected: "777 all in, 2 wins -> 0@bot"},
    {name: "a 2023 flip-all run cut off before it finished only leaves its latest balance",
        message: fake(`**<@777>'s Flips**
\`\`\`Ruby
Points: 40     Flips Left: 3

✅ ✅ 3️⃣2️⃣
\`\`\``),
        expected: "777 = 40@bot"},
    {name: "a martingale ladder is walked back from the final balance into changes",
        message: fake(busted),
        expected: "999 = 1000@bot | 999 +100 -> 1100 martingale/martin@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},
    {name: "a scrolled ladder records the rounds that scrolled off as one change from its starting balance",
        message: fake(scrolledLadder),
        expected: "999 = 1000@bot | 999 +100 -> 1100 martingale/martin@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},
    {name: "the attached ladder record restores the rounds that scrolled off",
        message: fake(scrolledLadder),
        record: "1) ✅ 100\n2) ❌ 100  ❌ 200  ❌ 400",
        expected: "999 = 1000@bot | 999 +100 -> 1100 martingale/martin@bot | 999 -100 -> 1000 martingale/martin@bot | 999 -200 -> 800 martingale/martin@bot | 999 -400 -> 400 martingale/martin@bot | 999 = 400@bot"},

    {name: "a finished war escrows both whole balances and pays the pot to the winner",
        message: fake(`War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob
Bet  500 | 300 ⠀
1) W 800 | 0    \`\`\`<@222> got dusted <:smodge:2>
<@111> won 300 points <:nice:3>`),
        expected: "111 -500 -> 0 warEscrow/war@bot | 222 -300 -> 0 warEscrow/war@bot | 111 +800 -> 800 warPayout/war@bot"},
    {name: "a war still being fought records nothing yet",
        message: fake(`War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob\nBet  500 | 300 ⠀\`\`\``),
        expected: ""},
    {name: "a rock paper scissors win escrows the accepted bet from both and pays double",
        message: fake(`<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> ✌ vs 👊 <@222>\n<@222> wins 40 points <:nice:2>`),
        expected: "111 -40 -> null rpsEscrow/rps@bot | 222 -40 -> null rpsEscrow/rps@bot | 222 +80 -> null rpsPayout/rps@bot"},
    {name: "a rock paper scissors tie refunds both, so nothing changed",
        message: fake(`<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> 👊 vs 👊 <@222>\nNo one wins :shruggers:`),
        expected: ""},
]

const challengeTests: {name: string, messages: Message<boolean>[], expected: string}[] = [
    {name: "a challenge accepted for less than offered leaves the accepter with nothing",
        messages: [
            fake(`<@111> has challenged <@222> for up to 100 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
            fake(`<@111> wins 60 points <:nice:1>`, {id: "result", at: new Date(minutes(1).getTime() + 400)}),
        ],
        expected: "111 -60 -> null challengeEscrow/challenge@accept | 222 -60 -> 0 challengeEscrow/challenge@accept | 111 +120 -> null challengePayout/challenge@accept"},
    {name: "an open challenge is paired with whoever accepted it",
        messages: [
            fake(`<@111> has challenged anyone for 60 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@333> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(2)}),
            fake(`<@333> wins 60 points <:nice:1>`, {id: "result", at: minutes(2)}),
        ],
        expected: "111 -60 -> null challengeEscrow/challenge@accept | 333 -60 -> null challengeEscrow/challenge@accept | 333 +120 -> null challengePayout/challenge@accept"},
    {name: "an accept with no offer before it is left out",
        messages: [
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
            fake(`<@222> wins 60 points <:nice:1>`, {id: "result", at: minutes(1)}),
        ],
        expected: ""},
    {name: "an offer from too long ago is not paired",
        messages: [
            fake(`<@111> has challenged anyone for 60 points.`, {id: "offer", at: minutes(0)}),
            fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(10)}),
            fake(`<@222> wins 60 points <:nice:1>`, {id: "result", at: minutes(10)}),
        ],
        expected: ""},
]

const outcome = (label: string, stakes: [string, number][], options: IFakeOptions) =>
    fake(`⠀  \`${label}            1 : 2.00\`\n${stakes.map(stake => `⠀       __<@${stake[0]}>: ${stake[1]}__\n`).join("")}⠀`, options)

const betTests: {name: string, messages: Message<boolean>[], expected: string}[] = [
    {name: "a settled bet escrows every stake and pays winners their stake plus the profit",
        messages: [
            outcome("1) Yes", [["111", 50], ["222", 30]], {id: "outcome1", thread: "t1", editedAt: minutes(5)}),
            outcome("2) No", [["333", 80]], {id: "outcome2", thread: "t1", editedAt: minutes(6)}),
            fake(`<@333> won 80 points :nice: and now has 400 points`, {id: "pay", thread: "t1", at: minutes(30)}),
            fake(`<@111> lost it all and now has 20 points :smodge:`, {id: "lost", thread: "t1", at: minutes(30)}),
        ],
        expected: "111 -50 -> null betEscrow/bet@outcome1 | 222 -30 -> null betEscrow/bet@outcome1 | 333 -80 -> null betEscrow/bet@outcome2 | 333 +160 -> 400 betPayout/bet@pay"},
    {name: "a bet that never paid out records nothing",
        messages: [outcome("1) Yes", [["111", 50]], {id: "outcome1", thread: "t1"})],
        expected: ""},
    {name: "a win whose stake cannot be seen is only a checkpoint",
        messages: [fake(`<@333> won 80 points :nice: and now has 400 points`, {id: "pay", thread: "t2"})],
        expected: "333 = 400@pay"},
    {name: "one thread's payouts never settle another thread's stakes",
        messages: [
            outcome("1) Yes", [["111", 50]], {id: "outcome1", thread: "t1"}),
            fake(`<@111> won 50 points :nice: and now has 400 points`, {id: "pay", thread: "t2"}),
        ],
        expected: "111 = 400@pay"},
]

const main = async () => {
    for (const test of tests) {
        check(test.name, summarize(observe(test.message, test.record)), test.expected)
    }

    for (const test of challengeTests) {
        const facts = test.messages
            .map(message => challengeFact(message))
            .filter((fact): fact is IChallengeFact => fact !== undefined)
        check(test.name, summarize(linkChallenges(facts)), test.expected)
    }

    for (const test of betTests) {
        const facts = test.messages.reduce((all: IBetFact[], message) => all.concat(betFacts(message)), [])
        check(test.name, summarize(linkBets(facts)), test.expected)
    }

    const offsets = (observations: Observation[]): string =>
        observations.map(observation => observation.at.getTime() - AT.getTime()).join(",")

    const waitingCommandId = SnowflakeUtil.generate(AT.getTime() - 8000)
    check("a gift or claim is dated at its reply, since a command waiting on the user's lock only moves points once it gets the lock",
        offsets(observe(fake(`You gave <@222> 50 points :nice: You now have 100 points`, {repliedUser: "111", reference: waitingCommandId}))
            .concat(observe(fake(`You got your daily 30 :dogegejam:`, {repliedUser: "111", reference: waitingCommandId})))), "0,0,0")

    check("a single flip is timed to when it was flipped, before its reply",
        offsets(observe(fake(`You won 50 points :nice: You've got 1234 points now.`, reply))), "-3200")
    check("a run's flips are spread evenly between the panel being posted and its last edit",
        offsets(observe(fake(alternating, {editedAt: new Date(AT.getTime() + 12000)}))), "0,3000,6000,9000,12000,12000")
    check("a flip panel edited long after its run finished puts its flips at the usual flip pace instead",
        offsets(observe(fake(alternating, {editedAt: new Date(AT.getTime() + 10 * 60000)}))), "0,4100,8200,12300,16400,16400")
    check("a ladder edited long after its run finished puts its steps at the usual ladder pace instead",
        offsets(observe(fake(busted, {editedAt: new Date(AT.getTime() + 10 * 60000)}))), "0,2200,4400,6600,8800,8800")

    const said = (content: string, userId: string, options: IFakeOptions) =>
        ({...(fake(content, options) as unknown as Record<string, unknown>), author: {id: userId}}) as unknown as Message<boolean>
    const seconds = (count: number): Date => new Date(AT.getTime() + count * 1000)

    const commandsSaid = ["!challenge 490376 <@222>", "!rps all", "!challenge some", "!challenge min", "!war <@222>", "!flip all 10"]
        .map(content => gameCommand(said(content, "111", {})))
        .map(command => command === undefined ? "none" : `${command.game} ${command.amount}`)
        .join(" | ")
    check("game commands give their game and stake", commandsSaid, "challenge 490376 | rps all | challenge null | challenge 1 | war all | none")

    const offersSeen = [
        "Challenge canceled :noppers:",
        "Game canceled :noppers:",
        "War canceled :noppers:",
        "<@111> has challenged anyone for 60 points. Challenge will be canceled <t:1:R>",
        "<@111> has challenged <@222> for up to 100 points.",
        "<@111> wants to play rock paper scissors against anyone for 40 points. Game will be canceled <t:1:R>",
        "<@111> wants a war  with <@222>, theres 750 points on the line :pepo_shake:\nWar will be canceled <t:1:R>",
        "<@111> wants a war  with <@222> :pepo_shake:",
        "<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> ✌ vs 👊 <@222>\n<@222> wins 40 points <:nice:2>",
        "<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> 👊 vs 👊 <@222>\nNo one wins :shruggers:",
    ]
        .map(content => gameOffer(fake(content)))
        .map(offer => offer === undefined ? "none" : `${offer.game} ${offer.state} ${offer.ownerId} ${offer.amount} keep ${offer.keep}`)
        .join(" | ")
    check("game messages give their state, owner, stake and what the owner kept", offersSeen,
        "challenge cancelled null null keep 0 | rps cancelled null null keep 0 | war cancelled null null keep 0 | challenge open 111 60 keep 0 | challenge accepted 111 100 keep 0 | rps open 111 40 keep 0 | war open 111 750 keep 0 | war accepted 111 null keep 0 | rps accepted 111 40 keep 40 | rps accepted 111 40 keep 0")

    const staked = (links: IStakeLinks): string => [
        ...links.observations.map(observation => observation.kind === "stakeHeld"
            ? `held ${observation.userId} ${observation.amount} ${observation.game}@${observation.messageId} for ${observation.offerId}`
            : observation.kind === "stakeReleased" ? `released ${observation.userId} ${observation.game}@${observation.messageId} keeping ${observation.keep}` : "other"),
        ...(links.heldOffers.size > 0 ? [`offers ${Array.from(links.heldOffers).join(",")}`] : []),
        ...(links.holds.length > 0 ? [`holds ${links.holds.length}`] : []),
    ].join(" | ")

    const warAcceptContent = `War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob\nBet  500 | 300 ⠀\n1) W 800 | 0    \`\`\`<@222> got dusted <:smodge:2>\n<@111> won 300 points <:nice:3>`
    const command = gameCommand(said("!challenge 490376", "111", {id: "cmd", at: seconds(0)}))
    const rpsCommand = gameCommand(said("!rps 100", "111", {id: "rpsCmd", at: seconds(0)}))
    const cancelled = gameOffer(fake("Challenge canceled :noppers:", {id: "offer", at: seconds(2), editedAt: seconds(60)}))
    const accepted = gameOffer(fake("<@111> has challenged <@222> for up to 100 points.", {id: "offer", at: seconds(2)}))
    const otherOpen = gameOffer(fake("<@222> has challenged anyone for 60 points. Challenge will be canceled <t:1:R>", {id: "offer", at: seconds(2)}))
    const lateCancel = gameOffer(fake("Challenge canceled :noppers:", {id: "offer", at: seconds(40), editedAt: seconds(90)}))
    const rpsGame = gameOffer(fake("<@111> against <@222> for 40 points <:pepo_smash:1>\n⠀\n<@111> ✌ vs 👊 <@222>\n<@222> wins 40 points <:nice:2>",
        {id: "game", at: seconds(1), editedAt: seconds(30)}))
    const warOffer = gameOffer(fake("<@111> wants a war  with <@222> :pepo_shake:", {id: "warOffer", at: seconds(0), editedAt: seconds(20)}))
    const warAccept = warFact(fake(warAcceptContent, {id: "warAccept", at: seconds(20)}))
    const warOfferAgain = gameOffer(fake("<@111> wants a war  with <@222> :pepo_shake:", {id: "warOfferAgain", at: seconds(40), editedAt: seconds(60)}))
    const warAcceptAgain = warFact(fake(warAcceptContent.replace("Bet  500", "Bet  800"), {id: "warAcceptAgain", at: seconds(60)}))
    if (!command || !rpsCommand || !cancelled || !accepted || !otherOpen || !lateCancel || !rpsGame || !warOffer || !warAccept || !warOfferAgain || !warAcceptAgain) {
        throw new Error("the stake fixtures did not parse")
    }

    check("a war accept gives the owner and their whole stake", `${warAccept.ownerId} ${warAccept.ownerBet}@${warAccept.messageId}`, "111 500@warAccept")
    check("a cancelled challenge is paired with the command that staked it and its refund",
        staked(linkStakes([command], [cancelled])), "held 111 490376 challenge@cmd for offer | released 111 challenge@cmd keeping 0")
    check("a stake is dated at its offer message, which the bot only sends once the stake is taken",
        linkStakes([command], [cancelled]).observations.map(observation => observation.at.getTime() - AT.getTime()).join(","), "2000,60000")
    check("a balance and a stake both remember the channel they were seen in",
        [...observe(fake(`You have 500 points`, {...reply, thread: "thread"})), ...linkStakes([command], [cancelled]).observations]
            .map(observation => observation.kind === "checkpoint" || observation.kind === "change" || observation.kind === "stakeHeld" ? observation.channelId : "-")
            .join(","), "thread,channel,-")
    check("an accepted challenge holds the stake its offer shows and leaves the rest to the challenge pairing",
        staked(linkStakes([command], [accepted])), "held 111 100 challenge@cmd for offer | offers offer")
    check("an accepted challenge with no command found holds an unknown stake until it was accepted",
        staked(linkStakes([], [accepted])), "held 111 null challenge@offer for offer | released 111 challenge@offer keeping 0")
    check("an offer from someone else is not paired with the command, but its shown owner still holds the stake",
        staked(linkStakes([command], [otherOpen])), "held 222 60 challenge@offer for offer | released 222 challenge@offer keeping 0")
    check("a cancelled offer too long after any command is a hold on the whole channel",
        staked(linkStakes([command], [lateCancel])), "holds 1")
    check("an rps command holds its full stake until the game ends, keeping only what was played for",
        staked(linkStakes([rpsCommand], [rpsGame])), "held 111 100 rps@rpsCmd for game | released 111 rps@rpsCmd keeping 40")
    check("an rps game with no command found holds an unknown stake while it runs",
        staked(linkStakes([], [rpsGame])), "held 111 null rps@game for game | released 111 rps@game keeping 40")
    check("an accepted war holds the owner's exact stake from the offer, tied to the accept that escrowed it",
        staked(linkStakes([], [warOffer], [warAccept])), "held 111 500 war@warOffer for warAccept")
    check("back to back wars each take the first accept after their own offer, whatever order they were found in",
        staked(linkStakes([], [warOfferAgain, warOffer], [warAcceptAgain, warAccept])),
        "held 111 500 war@warOffer for warAccept | held 111 800 war@warOfferAgain for warAcceptAgain")
    const repliedWar = fake(warAcceptContent, {id: "warReply", reference: "warCmd"})
    check("a war accept is tied to the same message its escrows are",
        `${warFact(repliedWar)?.messageId} ${observe(repliedWar).map(observation => observation.messageId).join(",")}`, "warCmd warCmd,warCmd,warCmd")

    const facts = [
        fake(`<@111> has challenged <@222> for up to 100 points.`, {id: "offer", at: minutes(0)}),
        fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
        fake(`<@111> wins 60 points <:nice:1>`, {id: "result", at: minutes(1)}),
    ].map(message => challengeFact(message)).filter((fact): fact is IChallengeFact => fact !== undefined)
    check("an accepted challenge whose stake was already held refunds the owner what the accepter could not match",
        summarize(linkChallenges(facts, new Set(["offer"]))),
        "111 +40 -> null challengeRefund/challenge@accept | 222 -60 -> 0 challengeEscrow/challenge@accept | 111 +120 -> null challengePayout/challenge@accept")

    const challengeIn = (offerChannel: string, resultChannel: string): IChallengeFact[] => [
        fake(`<@111> has challenged <@222> for up to 100 points.`, {id: "offer", at: minutes(0), thread: offerChannel}),
        fake(`Challenge accepted by <@222> for 60 points <:pepo_smash:1>`, {id: "accept", at: minutes(1)}),
        fake(`<@111> wins 60 points <:nice:1>`, {id: "result", at: minutes(1), thread: resultChannel}),
    ].map(message => challengeFact(message)).filter((fact): fact is IChallengeFact => fact !== undefined)
    check("a challenge accepted in one channel is not paired with an offer from another",
        summarize(linkChallenges(challengeIn("other", "channel"))), "")
    check("a challenge accepted in one channel is not paired with a result from another",
        summarize(linkChallenges(challengeIn("channel", "other"))), "")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
