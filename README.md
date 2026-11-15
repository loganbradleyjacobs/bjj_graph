A simple graph-based visualization web app. It loads a moveset JSON, and renders the nodes and edges with Cytoscape. The backend is FastAPI. 

Run with: `uvicorn app:app --reload`

## Modeling conventions

- **Control positions** split into Top/Bottom pairs (Mount / Bottom Mount, Side Control / Bottom Side Control, Kesa Getame / Bottom Kesa Getame, Half Guard / Bottom Half Guard, Full Guard / Bottom Full Guard, Quarter Guard, Back Control / Back Taken). Both sides are persistent, nameable states with distinct moves from each.
- **Submissions** are single nodes. Finishes flow in from the attacker's control position; Escapes flow out for the defender. Do not split into attacker/defender POV — "Getting RNC'd" is not a node, it's the instant before you tap.
- **Predicaments** are single nodes named from the defender's POV (Spiderweb, Body Triangle, S Mount, Armbar Defense, Triangle Defense, Stack Guard, Back Taken, Giftwrap, Arm Triangle, Turtle). A Predicament may have no incoming edge from a submission attempt — it is a state of danger, not necessarily a submission in progress.
- **Split a node only when both sides are persistent, nameable states** in BJJ vocabulary. "Getting X'd" is not a state — it's an event.
- **Offensive vs defensive versions of the same concept get distinct nodes.** Example: "Stack Guard" is the defensive predicament when you are being stacked; "Stack" is the offensive position when you are stacking the opponent's guard.

