// The app-wide Jot: one free-text pane, one text file, every space.
// The layout places this mod ("place": "none"); the tabs-jot fork's Jot
// button and cmd-shift-s toggle the hidden "jot" block. The text lives in
// data/jot/jot.txt in the app's home, so it survives restarts and hot
// reloads, and reads the same in every space.
// That file is the pad's whole interface: coding agents append notes to it
// (this repo's AGENTS.md gives them the path), and a watchFolder loop pulls
// their edits into the editor whenever nothing of ours is in flight — a
// person typing always wins.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Textarea, TextareaState } from "gpui-base";
import { appHome, readTextFile, writeTextFile, watchFolder, checking, theme, settings } from "herdr";

const dir = () => `${appHome()}/data/jot`;
const file = () => `${dir()}/jot.txt`;
// The terminals' mono font (Herdr's bundled default when unset).
const mono = () => settings().font_family ?? "JetBrains Mono";

export default class Jot extends View {
  init(_props, cx) {
    // Retained text state: a live host call, so it belongs here, never in render.
    this.state = TextareaState.new({ placeholder: "Jot anything — one pad for every space, saved as you type." });
    this.state.set_soft_wrap(true);
    this.typed = false;
    this.pending = undefined;
    this.writing = null;
    this.expected = null;
    this.state.on("change", (_e, cx) => {
      this.typed = true;
      this.queue(cx);
    });
    // Seed the editor from the file. If a keystroke lands first, the editor
    // wins and the next save (expected null) creates or replaces the file.
    cx.spawn(async () => {
      const text = await readTextFile(file()).catch(() => null);
      if (!this.typed) {
        this.expected = text;
        this.state.set_value(text ?? "");
      }
    });
    // External writers: an agent appending a note, another Herdr window's
    // edit. Watch the file's folder and pull the disk text into the editor
    // whenever nothing of ours is in flight — a person typing still wins,
    // and the compare-to-expected save below reconciles the rest. Skipped
    // under `herdr-app check`, which only renders once.
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        await watchFolder(dir());
        const text = await readTextFile(file()).catch(() => null);
        if (text !== null && text !== this.expected && this.writing === null && this.pending === undefined) {
          this.expected = text;
          this.state.set_value(text);
          cx.notify();
        }
      }
    });
  }

  // One write in flight at a time, the latest text first: no self-races, no
  // lost keystrokes. writeTextFile is atomic and writes only while the file
  // still matches the expected snapshot: anyone else's edit (another window,
  // an agent's note) rejects ours, the disk becomes the new snapshot and the
  // write is retried once — the latest writer wins, like Herdr's own shared
  // state.
  queue(cx) {
    this.pending = this.state.value();
    if (this.writing) return;
    this.writing = cx.spawn(async () => {
      for (;;) {
        const text = this.pending;
        if (text === undefined) break;
        this.pending = undefined;
        try {
          await writeTextFile(file(), text, this.expected);
          this.expected = text;
        } catch {
          const disk = await readTextFile(file()).catch(() => null);
          if (disk === text) { this.expected = text; continue; }
          try {
            await writeTextFile(file(), text, disk);
            this.expected = text;
          } catch { /* lost again; the next keystroke retries */ }
        }
      }
      this.writing = null;
    });
  }

  render() {
    const t = theme();
    return v_flex().id("jot").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Jot"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child("one pad · every space")))
      .child(Textarea.new(this.state).font_family(mono()).flex_1().min_h(0).px(14).py(12));
  }
}
