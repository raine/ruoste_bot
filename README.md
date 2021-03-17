# ruoste_bot

A telegram/discord bot that retrieves recently wiped Rust servers from
[just-wiped.net](https://just-wiped.net) and interacts with the server you're
playing on through the Rust+ companion API.

## features

- List recently wiped servers
- List future wipes calculated based on servers' prior history of wipes
- Rust+ related features
  - Show group online status and server player count in the bot activity
  - Receive smart alarm notifications in a specified discord channel
  - Map events (WIP)

![](https://raine.github.io/ruoste_bot/wipes.png?1)
![](https://raine.github.io/ruoste_bot/discord.png)

## commands

- `/wipes [maxgroup=x-y|x]` - List of recently wiped servers.
- `/nextwipes` - List servers that will be wiped in future.

## deployment

1. Create a bot on Telegram and/or Discord
2. Build the docker image
3. Run docker image with `TELEGRAM_BOT_TOKEN` and/or `DISCORD_BOT_TOKEN` set.
