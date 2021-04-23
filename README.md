# ruoste_bot

A discord bot for [Rust](https://rust.facepunch.com/)

## features

- List recently wiped servers
- List future wipes calculated based on servers' prior history of wipes

### rust+

- Show group online status and server player count in the bot activity
- Smart alarms posted on a channel
- Map events (e.g. cargo ship spawned)
- Upkeep tracking on a channel through storage monitors
- Control smart switches with reactions
- [Custom scripts](https://github.com/raine/ruoste_bot/tree/master/src/rustplus/scripts)

![](https://raine.github.io/ruoste_bot/wipes.png?1)
![](https://raine.github.io/ruoste_bot/discord.png)

## commands

- `/wipes [maxgroup=x-y|x]` - List of recently wiped servers.
- `/nextwipes` - List servers that will be wiped in future.
- `/rustplus configure <option> <value>`
  - Where `<option>` is one of `fcm`, `alerts_channel` or `events_channel`
- `/rustplus setbase` - Set the base location to coordinates of your player in
  game.

## deployment

1. Create a bot on Discord
2. Build the docker image
3. Run docker image with `DISCORD_BOT_TOKEN` set
