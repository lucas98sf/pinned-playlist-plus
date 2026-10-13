import { target, destinationLabel } from "./actions";
import { errorMessage } from "./errors";
import { VERSION, NAME } from "./constants";
import {
  latestRelease,
  installRelease,
  RELEASES_URL,
  type Release,
} from "./updates";
import type { SpicetifyHost, Settings, ToggleKey, Destination } from "./types";

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
      "Save songs to your first pinned or most recently updated editable playlist. Choose the destination below. Listening does not change which playlist was last edited.";
    root.append(help);
    const controls = {} as Record<ToggleKey, HTMLInputElement>;
    function caption(text: string) {
      const element = doc.createElement("span");
      for (const part of text.split(/([♥⊕])/)) {
        if (part === "♥" || part === "⊕") {
          const symbol = doc.createElement("span");
          symbol.className = "ppp-inline-symbol";
          symbol.textContent = part;
          element.append(symbol);
        } else element.append(doc.createTextNode(part));
      }
      return element;
    }
    function toggle(key: ToggleKey, text: string) {
      const row = doc.createElement("label");
      row.className = "ppp-toggle";
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = getSettings()[key];
      row.append(input, caption(text));
      root.append(row);
      controls[key] = input;
    }
    toggle("enabled", `Enable ${NAME}`);
    const destinationLabelElement = doc.createElement("label");
    destinationLabelElement.textContent = "Which playlist?";
    const destination = doc.createElement("select");
    destination.setAttribute("aria-label", "Which playlist?");
    for (const value of ["first-pinned", "recently-updated"] as const) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = destinationLabel(value);
      destination.append(option);
    }
    destination.value = getSettings().destination;
    destinationLabelElement.append(destination);
    root.append(destinationLabelElement);
    const modeLabel = doc.createElement("label");
    modeLabel.append(caption("What should ⊕ do?"));
    const mode = doc.createElement("select");
    for (const [value, text] of [
      ["playlist", "Save to playlist only"],
      ["both", "Save to playlist AND Liked Songs"],
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
      "Show a separate ♥ button for Liked Songs alongside ⊕",
    );
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    root.append(status);
    let requestGeneration = 0;
    function checkDestination() {
      const generation = ++requestGeneration;
      const selected = destination.value as Destination;
      const prefix = `${destinationLabel(selected)}: `;
      status.textContent = `${prefix}checking…`;
      target(api, selected)
        .then((result) => {
          if (generation !== requestGeneration) return;
          const name = doc.createElement("strong");
          name.textContent = result.name || "Unnamed playlist";
          status.replaceChildren(doc.createTextNode(prefix), name);
        })
        .catch((error) => {
          if (generation !== requestGeneration) return;
          status.textContent = errorMessage(error);
        });
    }
    destination.onchange = checkDestination;
    checkDestination();
    const saveSettings = () => {
      try {
        configure({
          enabled: controls.enabled.checked,
          mode: mode.value,
          destination: destination.value,
          separateHeart: controls.separateHeart.checked,
        });
        S.PopupModal.hide();
        S.showNotification(`${NAME} settings saved`);
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
    S.PopupModal.display({ title: NAME, content: root });
  }

  return {
    show: showSettings,
    dispose: unmountSettings,
    cleanDetached() {
      if (settingsMount && !settingsMount.isConnected) unmountSettings();
    },
  };
}
