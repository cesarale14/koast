/**
 * Preview routes for forward-looking M5 states (D-PREVIEW-ROUTES).
 *
 * Renders states 08 (ActionProposal) and 14 (MemoryArtifact) which the
 * substrate does not yet emit (action_proposed and action_completed
 * are wired by M6/M7 — D-FORWARD-EVENTS). Reachable only by
 * direct URL — unlinked from product nav, no auth bypass, no env flag
 * gating. Auth comes from being inside (dashboard).
 *
 * Composition uses the same shell + rail + surface components as the
 * live chat client, but the turn body is built statically rather than
 * driven by SSE. The D16 mock dispatcher seed (sampleStreamingTurn) is
 * imported so reviewers can see the shape it would arrive in.
 */

import { notFound } from "next/navigation";
import { ChatShell } from "@/components/chat/ChatShell";
import { Rail, type ConversationGroup } from "@/components/chat/Rail";
import { Surface } from "@/components/chat/Surface";
import { Topbar } from "@/components/chat/Topbar";
import { Turn } from "@/components/chat/Turn";
import { Meta } from "@/components/chat/Meta";
import { UserMessage } from "@/components/chat/UserMessage";
import { KoastMessage } from "@/components/chat/KoastMessage";
import { ToolCall } from "@/components/chat/ToolCall";
import { Composer } from "@/components/chat/Composer";
import { DayDivider } from "@/components/chat/DayDivider";
import { ActionProposal } from "@/components/chat/ActionProposal";
import { MemoryArtifact } from "@/components/chat/MemoryArtifact";

export const dynamic = "force-dynamic";

const SUPPORTED = new Set<string>(["08-action-proposal", "14-memory-artifact"]);

const FIXTURE_GROUPS: ConversationGroup[] = [
  {
    label: "Today",
    items: [
      {
        id: "preview-1",
        name: "Seabreeze Loft",
        meta: "draft pricing for Padres weekend",
        timeLabel: "2:14 pm",
      },
      {
        id: "preview-2",
        name: "Cypress House",
        meta: "late checkout request",
        timeLabel: "11:42 am",
      },
    ],
  },
  {
    label: "Yesterday",
    items: [
      {
        id: "preview-3",
        name: "Pier 9 Studio",
        meta: "turnover ran 23 min long",
        timeLabel: "7:18 pm",
      },
    ],
  },
];

const FIXTURE_USER = { initials: "JR", name: "Jordan R.", org: "staycommand" };
const FIXTURE_PROPERTY = { name: "Seabreeze Loft", meta: "Pacific Beach · 2 br" };

export default function M5StatePreviewPage({
  params,
}: {
  params: { state: string };
}) {
  if (!SUPPORTED.has(params.state)) notFound();

  return (
    <ChatShell>
      <Rail
        groups={FIXTURE_GROUPS}
        user={FIXTURE_USER}
        activeConversationId="preview-1"
      />
      <Surface
        topbar={<Topbar property={FIXTURE_PROPERTY} />}
        composer={
          <Composer
            state="empty"
            value=""
            onChange={() => {}}
            onSubmit={() => {}}
          />
        }
      >
        <DayDivider label="today · 2:14 pm" />
        {params.state === "08-action-proposal" && <ActionProposalDemo />}
        {params.state === "14-memory-artifact" && <MemoryArtifactDemo />}
      </Surface>
    </ChatShell>
  );
}

function ActionProposalDemo() {
  return (
    <>
      <Turn
        role="user"
        meta={<Meta role="user" who="You" time="2:14 pm" initials="JR" />}
      >
        <UserMessage>why is next weekend $184? feels low</UserMessage>
      </Turn>
      <Turn
        role="koast"
        meta={<Meta role="koast" who="Koast" time="2:14 pm" />}
      >
        <KoastMessage>
          <ToolCall
            name="read_comp_set"
            params={{ radius: "0.5mi", window: "weekend" }}
            state="completed"
            durationMs={240}
          />
          <p>
            $184 is <em>1.8% under</em> last year&apos;s clear price for the same
            Fri-Sat. There&apos;s a Padres home game Friday and the comp-set
            median moved to $179. The signal is real.
          </p>
          <ActionProposal
            head={
              <>
                Push price to <code>$199</code> on Airbnb · expires Tue 12:00 pm
              </>
            }
            why="Last year's clear was $186 ($172 baseline + 8% Padres lift). $199 is a 7% test above it; if it doesn't bite by Wed 6 pm I'll re-baseline. Holding $184 walks past about $42 of likely revenue across two nights."
            actions={[
              {
                id: "approve",
                label: "Approve",
                kind: "primary",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ),
              },
              { id: "try-209", label: "Try $209 instead", kind: "secondary" },
              { id: "hold", label: "Hold at $184", kind: "secondary" },
              { id: "manual", label: "I'll write it", kind: "ghost" },
            ]}
          />
        </KoastMessage>
      </Turn>
    </>
  );
}

function MemoryArtifactDemo() {
  return (
    <>
      <Turn
        role="user"
        meta={<Meta role="user" who="You" time="2:14 pm" initials="JR" />}
      >
        <UserMessage>
          btw the front door code at seabreeze is 4827, valid through end of summer
        </UserMessage>
      </Turn>
      <Turn
        role="koast"
        meta={<Meta role="koast" who="Koast" time="2:14 pm" />}
      >
        <KoastMessage>
          <p>
            Got it — I want to save this so I can hand it to guests on arrival
            without asking you again.
          </p>
          <MemoryArtifact
            state="pending"
            fact={[
              { kind: "key", text: "seabreeze loft · front_door · code →" },
              { kind: "val", text: "4827" },
              { kind: "key", text: "· valid through" },
              { kind: "val", text: "2025-09-21" },
            ]}
            onSave={() => {}}
            onEdit={() => {}}
            onDiscard={() => {}}
          />
          <p>
            If you want me to rotate the code on a schedule, I can do that —
            just tell me the cadence.
          </p>
        </KoastMessage>
      </Turn>
      <Turn
        role="user"
        meta={<Meta role="user" who="You" time="2:15 pm" initials="JR" />}
      >
        <UserMessage>save it</UserMessage>
      </Turn>
      <Turn
        role="koast"
        meta={
          <Meta role="koast" who="Koast" time="2:15 pm" avatarState="milestone" />
        }
      >
        <KoastMessage>
          <MemoryArtifact
            state="saved"
            layersSettled={1}
            fact={[
              { kind: "key", text: "seabreeze loft · front_door · code →" },
              { kind: "val", text: "4827" },
              { kind: "key", text: "· valid through" },
              { kind: "val", text: "2025-09-21" },
            ]}
          />
          <p>
            Saved. I&apos;ll use this on arrival messages and rotate the
            reminder for you 5 days before Sept 21.
          </p>
        </KoastMessage>
      </Turn>
    </>
  );
}
