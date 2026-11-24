type NavigationEvent = {
  url: string;
  data?: unknown;
  force?: boolean;
};

type SubscribeFunction = (event: NavigationEvent) => void | Promise<void>;

const subscribers: SubscribeFunction[] = [];

export function subscribe(fn: SubscribeFunction): void {
  subscribers.push(fn);
}

export async function dispatch(event: NavigationEvent): Promise<void> {
  for (const fn of subscribers) {
    try {
      await fn(event);
    } catch (e) {
      console.error("Navigation event subscriber threw an error");
      console.error(e);
    }
  }
}
