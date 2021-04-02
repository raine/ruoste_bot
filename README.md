# ruoste_bot

A telegram/discord bot for [Rust](https://rust.facepunch.com/)

## features

- List recently wiped servers
- List future wipes calculated based on servers' prior history of wipes
- Rust+ related features
  - Show group online status and server player count in the bot activity
  - Receive smart alarm notifications to a channel
  - Post map events to a channel (e.g. cargo ship spawned)
  - Some kind of support for controlling smart switches through script API (TBD)

![](https://raine.github.io/ruoste_bot/wipes.png?1)
![](https://raine.github.io/ruoste_bot/discord.png)

## commands

- `/wipes [maxgroup=x-y|x]` - List of recently wiped servers.
- `/nextwipes` - List servers that will be wiped in future.
- `/rustplus configure <option> <value>`
    - Where `<option>` is one of `fcm`, `alerts_channel` or `events_channel`

## deployment

1. Create a bot on Telegram and/or Discord
2. Build the docker image
3. Run docker image with `TELEGRAM_BOT_TOKEN` and/or `DISCORD_BOT_TOKEN` set.
