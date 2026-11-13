# Home Twin Alarm Card

Lovelace cards for the **Alarm System** integration (`alarm_system_ha_integration`, domain `alarm_system`), designed for a hallway wall tablet:

- **`custom:home-twin-alarm-card`** – tile: state large and coloured, countdown during exit delay. Tapping opens the control popup (Browser Mod, or a built-in window). During entry delay / when triggered a red full-screen overlay with countdown and PIN keypad appears.
- **`custom:home-twin-alarm-popup`** – popup content: PIN keypad, mode selection, open windows/doors before arming ("arm anyway" / "cancel"), history and administration (modes and delays, sensors per mode, persons and PINs, notification channels, automation by BLE / lock).

UI language: German.

## Requirements

- [alarm_system_ha_integration](https://github.com/SysriX/alarm_system_ha_integration) – provides `alarm_control_panel.home_security_system` and the WebSocket commands `alarm_system/*`
- Optional: [Browser Mod](https://github.com/thomasloven/hass-browser_mod) for the popup (`popup: browser_mod`, default) and as the default "source" name in the history
- Optional: `input_select.klingel_gerate` – list of tablets (Browser Mod ids, format `id@…`) offered when selecting tablets for a notification channel. Without it the list is empty.
- Styled to match the **Room Tablet** theme (`room_tablet_ha_theme`)

## Installation

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/SysriX/home_twin_alarm_ha_card`, category **Dashboard**.
2. Install the card from HACS and reload the browser.
3. HACS registers the resource automatically: `/hacsfiles/home_twin_alarm_ha_card/home_twin_alarm_ha_card.js` (JavaScript module).

### Manual

1. Copy `dist/home_twin_alarm_ha_card.js` to `/config/www/home_twin_alarm_ha_card.js`.
2. Settings → Dashboards → ⋮ → **Resources** → add `/local/home_twin_alarm_ha_card.js` as **JavaScript module**.
3. Reload the browser.

## Configuration

### Tile

```yaml
type: custom:home-twin-alarm-card
entity: alarm_control_panel.home_security_system   # default
titel: Alarmanlage        # "" = no header
hintergrund: true         # false = no own glass plate (e.g. inside a room-panel frame)
vollbild: true            # red full-screen overlay on entry delay / trigger
ton: true                 # beep during entry delay, siren sound when triggered (this device only)
popup: browser_mod        # browser_mod | eigen (built-in window, no Browser Mod needed)
quelle: Hallway tablet    # name written to the history (default: Browser Mod id)
```

### Popup content

```yaml
type: custom:home-twin-alarm-popup
entity: alarm_control_panel.home_security_system
ton: true
quelle: Hallway tablet
schliessen: true          # close the Browser Mod popup after arming/disarming
```

### Building blocks for Room Panel

The tile exposes building blocks for [room_panel_ha_card](https://github.com/SysriX/room_panel_ha_card) (`custom:raum-panel` ≥ 2.98, rp-extcard bridge): `titel`, `display`, `symbol`, `zustand`, `info`, `offen`. Use `teil: <block>` (set automatically by the room panel with `layout: custom`) to render only one block, borderless and filling its cell. Full screen and sound still run only once per page.

## Notes

This card was built for the author's own home and tablets. Some defaults (entity ids, dashboard paths) reflect that setup and may need to be set explicitly in your configuration.

## Version

1.2.1

## License

MIT – see [LICENSE](LICENSE).
