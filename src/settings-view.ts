import { target } from "./actions";
import { errorMessage } from "./errors";
import { VERSION } from "./constants";
import {
  latestRelease,
  installRelease,
  RELEASES_URL,
  type Release,
} from "./updates";
import type { SpicetifyHost, Settings, ToggleKey } from "./types";

export function createSettingsView(
  S: SpicetifyHost,
  doc: Document,
  getSettings: () => Settings,
  configure: (next: unknown) => void,
) {
  const api = S.Platform;
  let settingsMount: HTMLElement | null = null;
  function unmountSettings() {
    if (settingsMount) S.ReactDOM?.unmountComponentAtNode?.(settingsMount);
    settingsMount = null;
  }
  function showSettings() {
    unmountSettings();
    const root = doc.createElement("div");
    root.className = "ppp-settings";
    const help = doc.createElement("p");
    help.textContent =
      "Uses the first pinned playlist in Your Library. Reorder your pins to change the destination.";
    root.append(help);
    const controls = {} as Record<ToggleKey, HTMLInputElement>;
    function toggle(key: ToggleKey, text: string) {
      const row = doc.createElement("label");
      row.className = "ppp-toggle";
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = getSettings()[key];
      row.append(input, doc.createTextNode(text));
      root.append(row);
      controls[key] = input;
    }
    toggle("enabled", "Enable Pinned Playlist Plus");
    const modeLabel = doc.createElement("label");
    modeLabel.textContent = "What should + do?";
    const mode = doc.createElement("select");
    for (const [value, text] of [
      ["playlist", "Add to first pinned playlist"],
      ["both", "Add to first pinned playlist AND Liked Songs"],
      ["liked", "Toggle Liked Songs only"],
    ]) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = text;
      mode.append(option);
    }
    mode.value = getSettings().mode;
    modeLabel.append(mode);
    root.append(modeLabel);
    toggle(
      "separateHeart",
      "Show a separate ♥ button for Liked Songs alongside +",
    );
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "First pinned playlist: checking…";
    root.append(status);
    target(api)
      .then((result) => {
        const name = doc.createElement("strong");
        name.textContent = result.name || "Unnamed playlist";
        status.replaceChildren(
          doc.createTextNode("First pinned playlist: "),
          name,
        );
      })
      .catch((error) => {
        status.textContent = errorMessage(error);
      });
    const saveSettings = () => {
      try {
        configure({
          enabled: controls.enabled.checked,
          mode: mode.value,
          separateHeart: controls.separateHeart.checked,
        });
        S.PopupModal.hide();
        S.showNotification("Pinned Playlist Plus settings saved");
      } catch (error) {
        status.textContent = errorMessage(error);
      }
    };
    const actions = doc.createElement("div");
    actions.className = "ppp-settings-actions";
    root.append(actions);
    if (
      S.React?.createElement &&
      S.ReactDOM?.render &&
      S.ReactComponent?.ButtonPrimary
    ) {
      settingsMount = actions;
      S.ReactDOM.render(
        S.React.createElement(
          S.ReactComponent.ButtonPrimary,
          {
            buttonSize: "md",
            colorSet: "brightAccent",
            onClick: saveSettings,
          },
          "Save settings",
        ),
        actions,
      );
    } else {
      const save = doc.createElement("button");
      save.type = "button";
      save.className = "ppp-save";
      save.textContent = "Save settings";
      save.onclick = saveSettings;
      actions.append(save);
    }
    const version = doc.createElement("p");
    const marketplace = [...doc.scripts].some((script) =>
      script.src.includes("lucas98sf/pinned-playlist-plus"),
    );
    version.textContent = `Version ${VERSION} · ${marketplace ? "Marketplace" : "Manual installation"}`;
    root.append(version);
    const updateStatus = doc.createElement("p");
    updateStatus.setAttribute("role", "status");
    const update = doc.createElement("button");
    update.type = "button";
    update.className = "ppp-update";
    update.textContent = "Check for updates";
    let release: Release | null = null;
    let installed = false;
    update.onclick = async () => {
      if (installed) {
        doc.defaultView?.location.reload();
        return;
      }
      update.disabled = true;
      try {
        if (release) {
          await installRelease(release);
          installed = true;
          updateStatus.textContent = `Version ${release.version} selected. Reload Spotify to finish updating. Your settings are preserved.`;
          update.textContent = "Reload Spotify";
        } else {
          release = await latestRelease();
          updateStatus.textContent = release
            ? `Version ${release.version} is available.`
            : `Version ${VERSION} is up to date.`;
          if (release) update.textContent = `Install v${release.version}`;
        }
      } catch (error) {
        updateStatus.textContent = errorMessage(error);
      } finally {
        update.disabled = false;
      }
    };
    const notes = doc.createElement("a");
    notes.href = RELEASES_URL;
    notes.target = "_blank";
    notes.rel = "noopener noreferrer";
    notes.textContent = "Release notes";
    const updateActions = doc.createElement("div");
    updateActions.className = "ppp-update-actions";
    updateActions.append(update, notes);
    root.append(updateStatus, updateActions);
    S.PopupModal.display({ title: "Pinned Playlist Plus", content: root });
  }

  return {
    show: showSettings,
    dispose: unmountSettings,
    cleanDetached() {
      if (settingsMount && !settingsMount.isConnected) unmountSettings();
    },
  };
}
