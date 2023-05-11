import { HttpSpacePrimitives } from "../common/spaces/http_space_primitives.ts";
import type { SpacePrimitives } from "../common/spaces/space_primitives.ts";
import { SpaceSync, SyncStatusItem } from "../common/spaces/sync.ts";
import { EventHook } from "../plugos/hooks/event.ts";
import { SysCallMapping } from "../plugos/system.ts";

export class SyncEngine {
  syncing = false;
  snapshot?: Map<string, SyncStatusItem>;
  remoteSpace?: HttpSpacePrimitives;
  spaceSync?: SpaceSync;

  constructor(
    private localSpacePrimitives: SpacePrimitives,
    syncEndpoint: string,
    private storeCalls: SysCallMapping,
    private eventHook: EventHook,
    expectedSpacePath: string,
    private isSyncCandidate: (path: string) => boolean,
  ) {
    // TODO: Auth
    this.remoteSpace = new HttpSpacePrimitives(syncEndpoint, expectedSpacePath);

    eventHook.addLocalListener("editor:pageLoaded", async (name) => {
      await this.syncFile(`${name}.md`);
    });

    eventHook.addLocalListener("page:saved", async (name) => {
      await this.syncFile(`${name}.md`);
    });
  }

  async init() {
    const fakeCtx: any = {};
    const snapshot =
      (await this.storeCalls["store.get"](fakeCtx, "syncSnapshot")) ||
      {};
    this.snapshot = new Map<string, SyncStatusItem>(
      Object.entries(snapshot),
    );

    this.spaceSync = new SpaceSync(
      this.localSpacePrimitives,
      this.remoteSpace!,
      this.snapshot!,
      {
        conflictResolver: SpaceSync.primaryConflictResolver,
        isSyncCandidate: this.isSyncCandidate,
      },
    );
  }

  async syncSpace(): Promise<number> {
    if (this.syncing) {
      console.log("Already syncing");
      return 0;
    }
    this.syncing = true;
    let operations = 0;
    try {
      operations = await this.spaceSync!.syncFiles();
    } catch (e: any) {
      console.error("Sync error", e);
    }
    await this.saveSnapshot();
    this.syncing = false;
    this.eventHook.dispatchEvent("sync:done");
    return operations;
  }

  async syncFile(name: string) {
    if (this.syncing) {
      // console.log("Already syncing");
      return;
    }
    if (!this.isSyncCandidate(name)) {
      return;
    }
    this.syncing = true;
    console.log("Syncing file", name);
    try {
      let localHash: number | undefined = undefined;
      let remoteHash: number | undefined = undefined;
      try {
        localHash =
          (await this.localSpacePrimitives.getFileMeta(name)).lastModified;
      } catch {
        // Not present
      }
      try {
        remoteHash = (await this.remoteSpace!.getFileMeta(name)).lastModified;
      } catch (e: any) {
        if (e.message.includes("File not found")) {
          // File doesn't exist remotely, that's ok
        } else {
          throw e;
        }
      }

      await this.spaceSync!.syncFile(
        name,
        localHash,
        remoteHash,
      );
    } catch (e: any) {
      console.error("Sync error", e);
    }
    await this.saveSnapshot();
    this.syncing = false;
  }

  async saveSnapshot() {
    const fakeCtx: any = {};
    await this.storeCalls["store.set"](
      fakeCtx,
      "syncSnapshot",
      Object.fromEntries(this.snapshot!),
    );
  }
}
