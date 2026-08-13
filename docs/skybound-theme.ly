\version "2.24.0"

% Sheet music for the looping launch theme synthesized in js/music.js.
% 4-bar cycle: Am - F - C - G, arpeggio in sixteenths (up an octave each half
% bar), a root bass note per bar, four-on-the-floor kick. Tempo ~130 BPM.

\header {
  title = "SKYBOUND"
  subtitle = "Launch Theme — a looping 4-bar cycle"
  composer = "from js/music.js (Web Audio)"
  tagline = ##f
}

\paper { indent = 8\mm }

global = { \time 4/4 \key c \major \tempo 4 = 130 }

harmonies = \chordmode { a1:m f1 c1 g1 }

lead = {
  \global
  % Am
  a'16 c'' e'' a'' a' c'' e'' a'' a'' c''' e''' a''' a'' c''' e''' a'''
  % F
  f'16 a' c'' f'' f' a' c'' f'' f'' a'' c''' f''' f'' a'' c''' f'''
  % C
  c''16 e'' g'' c''' c'' e'' g'' c''' c''' e''' g''' c'''' c''' e''' g''' c''''
  % G
  g'16 b' d'' g'' g' b' d'' g'' g'' b'' d''' g''' g'' b'' d''' g'''
  \bar "|."
}

bassline = {
  \global
  \clef bass
  a,4 r4 r2 | f,4 r4 r2 | c4 r4 r2 | g,4 r4 r2
  \bar "|."
}

beat = \drummode {
  \time 4/4
  bd4 bd bd bd | bd bd bd bd | bd bd bd bd | bd bd bd bd
  \bar "|."
}

\score {
  <<
    \new ChordNames \harmonies
    \new Staff \with { instrumentName = "Lead " } \lead
    \new Staff \with { instrumentName = "Bass " } \bassline
    \new DrumStaff \with { instrumentName = "Kick " } \beat
  >>
  \layout { }
  \midi { }
}
