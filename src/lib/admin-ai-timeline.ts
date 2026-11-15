type TimelineMessage = { id: string; turnId: string; role: "USER" | "ASSISTANT" };
type TimelineAction = { id: string; turnId: string };

export type AdminAiTimelineItem<TMessage extends TimelineMessage, TAction extends TimelineAction> =
  | { kind: "message"; key: string; message: TMessage }
  | { kind: "action"; key: string; action: TAction };

export function buildAdminAiTimeline<TMessage extends TimelineMessage, TAction extends TimelineAction>(messages: readonly TMessage[], actions: readonly TAction[]): Array<AdminAiTimelineItem<TMessage, TAction>> {
  const actionByTurn = new Map(actions.map((action) => [action.turnId, action]));
  const actionPlacementByTurn = new Map<string, string>();

  for (const message of messages) {
    if (message.role === "ASSISTANT") actionPlacementByTurn.set(message.turnId, message.id);
    else if (!actionPlacementByTurn.has(message.turnId)) actionPlacementByTurn.set(message.turnId, message.id);
  }

  return messages.flatMap((message) => {
    const items: Array<AdminAiTimelineItem<TMessage, TAction>> = [{ kind: "message", key: `message:${message.id}`, message }];
    const action = actionByTurn.get(message.turnId);
    if (action && actionPlacementByTurn.get(message.turnId) === message.id) items.push({ kind: "action", key: `action:${action.id}`, action });
    return items;
  });
}
