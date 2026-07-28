"""Derive and verify the closed-form hit probability (features 002 Q2, 003 Q3).

READ-ONLY. Opens the workbook for reading and never writes it.

Run:  py tools/verify-accuracy.py

Verified 2026-07-28 against resources/mechanics/01-stats.md. Reproduces EXACTLY:
  mean miss 42.6% symmetric / 13.0% with +20 · p10 · p90 · 315 and 0 pairs >50%
  hit rate 57.4% -> 87.0% · throughput 1.516x · 155/1.516 = 102 hero-turns
  42 auto-hits, 0 auto-misses · the whole die-shrink table incl. 158 at Luck x0.5

TWO SMALL DISCREPANCIES, recorded in specs/002-sim-rules/research.md:
  - floor(Luck x 1.5) is canon (the prose says Luck 15 rolls 1-22) and is what the
    recorded MEANS reproduce. The recorded symmetric max of 82.5% came from a
    half-up die -- the published table mixes two conventions.
  - The `+20 max` cell reads 45.2%, which is the symmetric MEDIAN from the cell
    diagonally above it. Under every rounding convention the true value is 46.2%.
    A transcription between adjacent cells. Nothing depends on it.

attack  = Perception + 20 + rand(1..floor(Luck_a*1.5))
defense = Agility        + rand(1..floor(Luck_d*1.5))
hit iff attack > defense  (ties to the defender)

Closed form, exact, O(Na):
  m  = Agility_d - Perception_a - EDGE          # margin the attacker must exceed
  Na = floor(Luck_a*1.5) ; Nd = floor(Luck_d*1.5)
  P(hit) = (1/(Na*Nd)) * SUM_{a=1..Na} clamp(a - m - 1, 0, Nd)
"""
import random, statistics, openpyxl

WB = openpyxl.load_workbook(r"d:\Codelib\LMNTLZ\resources\characters\hero-stats.xlsx", data_only=True)
hs = WB["Hero Stats"]; hdr = [c.value for c in hs[1]]
iN, iP, iA, iL = (hdr.index("Hero"), hdr.index("Perception"),
                  hdr.index("Agility"), hdr.index("Luck"))
H = [(str(r[iN]).strip(), int(r[iP]), int(r[iA]), int(r[iL]))
     for r in hs.iter_rows(min_row=2, values_only=True) if r[iN]]
assert len(H) == 27, len(H)

def die(luck): return int(luck * 1.5)

def p_hit(per_a, luck_a, agi_d, luck_d, edge=20):
    Na, Nd = die(luck_a), die(luck_d)
    m = agi_d - per_a - edge
    tot = 0
    for a in range(1, Na + 1):
        tot += min(max(a - m - 1, 0), Nd)
    return tot / (Na * Nd)

def stats(edge):
    misses = []
    for _, pa, _, la in H:
        for _, _, ad, ld in H:
            misses.append(1 - p_hit(pa, la, ad, ld, edge))
    misses.sort()
    n = len(misses)
    q = lambda f: misses[int(f * (n - 1))]
    return dict(min=misses[0], p10=q(.10), median=statistics.median(misses),
                mean=statistics.mean(misses), p90=q(.90), max=misses[-1],
                over50=sum(1 for m in misses if m > .50),
                hitrate=1 - statistics.mean(misses))

print("729 attacker/defender pairs, unclamped\n")
print(f"{'':16s} {'symmetric':>12s} {'recorded':>10s} | {'with +20':>10s} {'recorded':>10s}")
REC0 = dict(min=.068, p10=.195, median=.452, mean=.426, p90=.702, max=.825, over50=315)
REC20 = dict(min=.000, p10=.003, median=.094, mean=.131, p90=.289, max=.452, over50=0)
s0, s20 = stats(0), stats(20)
for k in ("min", "p10", "median", "mean", "p90", "max"):
    print(f"  {k:14s} {s0[k]*100:11.1f}% {REC0[k]*100:9.1f}% | "
          f"{s20[k]*100:9.1f}% {REC20[k]*100:9.1f}%")
print(f"  {'pairs >50% miss':14s} {s0['over50']:12d} {REC0['over50']:10d} | "
      f"{s20['over50']:10d} {REC20['over50']:10d}")
print(f"\n  hit rate      {s0['hitrate']*100:11.1f}% (recorded 57.4%) | "
      f"{s20['hitrate']*100:9.1f}% (recorded 86.9%)")
print(f"  throughput ratio {s20['hitrate']/s0['hitrate']:.3f}  (recorded 1.51)")
print(f"  155 / that ratio = {155/(s20['hitrate']/s0['hitrate']):.0f} hero-turns "
      f"(recorded ~102)")

# auto-hits / auto-misses
ah = sum(1 for _, pa, _, la in H for _, _, ad, ld in H if p_hit(pa, la, ad, ld) >= 1.0)
am = sum(1 for _, pa, _, la in H for _, _, ad, ld in H if p_hit(pa, la, ad, ld) <= 0.0)
print(f"  auto-hits {ah} (recorded 42) · auto-misses {am} (recorded 0)")

print("\n=== the die-shrink table (why not reduce Luck's multiplier) ===")
print(f"{'mult':>6s} {'median miss':>12s} {'p90':>8s} {'determ.':>8s}   recorded")
REC = {1.5: (.452, .702, 0), 1.0: (.371, .720, 0), 0.75: (.291, .816, 0),
       0.5: (.167, .944, 158), 0.25: (.019, 1.00, 494)}
for mult in (1.5, 1.0, .75, .5, .25):
    d = lambda l, mu=mult: max(1, int(l * mu))
    ms = []
    det = 0
    for _, pa, _, la in H:
        for _, _, ad, ld in H:
            Na, Nd = d(la), d(ld)
            m = ad - pa
            tot = sum(min(max(a - m - 1, 0), Nd) for a in range(1, Na + 1))
            p = tot / (Na * Nd)
            ms.append(1 - p)
            if p <= 0 or p >= 1: det += 1
    r = REC[mult]
    print(f"  {mult:4.2f} {statistics.median(ms)*100:11.1f}% "
          f"{sorted(ms)[int(.9*728)]*100:7.1f}% {det:8d}   "
          f"{r[0]*100:.1f}% / {r[1]*100:.1f}% / {r[2]}")

print("\n=== Monte Carlo agreement (003 Q3) ===")
random.seed(20260728)
worst = 0.0
for name_a, pa, _, la in H[:6]:
    for name_d, _, ad, ld in H[:6]:
        exact = p_hit(pa, la, ad, ld)
        N = 400_000
        Na, Nd = die(la), die(ld)
        hits = sum(1 for _ in range(N)
                   if pa + 20 + random.randint(1, Na) > ad + random.randint(1, Nd))
        emp = hits / N
        worst = max(worst, abs(exact - emp))
print(f"  36 pairs x 400k trials: max |closed form - empirical| = {worst:.5f}")
print(f"  3 sigma at N=400k is ~{3*0.5/ (400_000**0.5):.5f}")
