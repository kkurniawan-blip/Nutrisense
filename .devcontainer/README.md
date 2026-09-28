# NutriSense in GitHub Codespaces

The app starts by itself in this codespace. The first start takes about 5–10 minutes: it installs everything, builds the web app and creates the demo data.

## Open it on your phone

1. At the bottom of the screen, open the **Ports** tab. You should see port **8000**, labelled "NutriSense app".
   - If port 8000 is not there yet, wait a minute: the app is still starting.
2. Right-click port 8000 → **Port Visibility → Public**.
   - Without this step, only you can open the link, after logging in to GitHub.
3. Copy the link from the **Forwarded Address** column. It looks like `https://your-codespace-8000.app.github.dev`.
4. Open the link on any phone and log in with a demo account:
   - mother `ibu.maria@nutrisense.id`
   - Kader `kader.oesapa@nutrisense.id`
   - officer `officer@nutrisense.id`
   - doctor `doctor@nutrisense.id`

   The password for all of them is `Demo1234!`.

## Good to know

- **The link works while this codespace is running.** A codespace stops after 30 minutes without activity in this editor; you can raise that to 4 hours under GitHub **Settings → Codespaces → Default idle timeout**. To use it again, open **Code → Codespaces** on the repository and click the codespace. The app starts by itself, with the same link and the same data. Check that port 8000 is still **Public** in the Ports tab.
- **Free time:** personal GitHub accounts get about 60 hours a month for free on this machine size. Stop the codespace when you are done (**Code → Codespaces → … → Stop codespace**).
- **Problems?** Run `bash .devcontainer/start.sh` in the terminal, and see `/tmp/nutrisense.log`.
- **The demo is public** when the port is public. Do not enter real children's data.
