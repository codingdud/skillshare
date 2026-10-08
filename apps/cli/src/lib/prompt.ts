import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export type Prompter = {
  ask(question: string, fallback?: string): Promise<string>;
  say(message: string): void;
};

export const isInteractive = () => Boolean(stdin.isTTY && stdout.isTTY);

export function terminalPrompter(): Prompter & { close(): void } {
  const rl = createInterface({ input: stdin, output: stdout });
  const closed = new Promise<never>((_, reject) =>
    rl.once('close', () => reject(new Error('Cancelled.'))),
  );
  closed.catch(() => undefined);
  return {
    async ask(question, fallback) {
      const suffix = fallback ? ' [' + fallback + ']' : '';
      const answer = await Promise.race([rl.question('? ' + question + suffix + ': '), closed]);
      return answer.trim() || fallback || '';
    },
    say: (message) => console.log(message),
    close: () => rl.close(),
  };
}
