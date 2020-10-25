# ruoste_bot

A telegram/discord bot that retrieves recently wiped Rust servers from
[just-wiped.net](https://just-wiped.net). Also predicts future wipes.

![](https://raine.github.io/ruoste_bot/wipes.png?1)

# commands

- `/wipes` - List of recently wiped servers.
- `/nextwipes` - List servers that will be wiped in future.

# deployment

1. Create a bot on Telegram and/or Discord
2. Build the docker image
3. Run docker image with `TELEGRAM_BOT_TOKEN` and/or `DISCORD_BOT_TOKEN` set.
