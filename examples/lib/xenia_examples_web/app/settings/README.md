# Settings

Icons, notifications and languages together, as a real settings panel.
Open it at `/settings`.

**Try it:** turn a switch on, switch to Deutsch, and click
"Änderungen speichern". The message says "Einstellungen erfolgreich
gespeichert", with its icon, and the switches kept their state.

| | English | German |
|---|---|---|
| Button | Save changes | Änderungen speichern |
| Message | Settings saved successfully | Einstellungen erfolgreich gespeichert |

- **The Save button** has a Lucide icon: `<.icon name="lucide-save" />`.
- **The message** is `put_flash(socket, :success, gettext(...))`, shown
  with its success icon.
- **The switches** are a JavaScript island
  ([`toggles.js`](../../../../assets/js/islands/toggles.js)). Their labels
  come translated from the server as props, and each change goes back to
  the server as an event, so the server owns the settings.
