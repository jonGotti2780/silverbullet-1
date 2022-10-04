import { matchBefore } from "../../plugos-silverbullet-syscall/editor.ts";
import { listCommands } from "../../plugos-silverbullet-syscall/system.ts";

export async function commandComplete() {
  let prefix = await matchBefore("\\{\\[[^\\]]*");
  if (!prefix) {
    return null;
  }
  let allCommands = await listCommands();

  return {
    from: prefix.from + 2,
    options: Object.keys(allCommands).map((commandName) => ({
      label: commandName,
      type: "command",
    })),
  };
}
