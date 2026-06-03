import Config, * as UpdateConfig from "../config";
import { FunboxName } from "@monkeytype/schemas/configs";
import { Mode } from "@monkeytype/schemas/shared";

type ContestConfigSnapshot = {
  mode: Mode;
  time: number;
  punctuation: boolean;
  numbers: boolean;
  funbox: FunboxName[];
};

let snapshot: ContestConfigSnapshot | null = null;

export function isActive(): boolean {
  return snapshot !== null;
}

export function apply(): void {
  snapshot = {
    mode: Config.mode,
    time: Config.time,
    punctuation: Config.punctuation,
    numbers: Config.numbers,
    funbox: [...Config.funbox],
  };

  UpdateConfig.setMode("time", true);
  UpdateConfig.setTimeConfig(60, true);
  UpdateConfig.setPunctuation(false, true);
  UpdateConfig.setNumbers(false, true);
  UpdateConfig.setFunbox([], true);
}

export function restore(): void {
  if (snapshot === null) return;

  UpdateConfig.setMode(snapshot.mode, true);
  UpdateConfig.setTimeConfig(snapshot.time, true);
  UpdateConfig.setPunctuation(snapshot.punctuation, true);
  UpdateConfig.setNumbers(snapshot.numbers, true);
  UpdateConfig.setFunbox(snapshot.funbox, true);
  snapshot = null;
}
