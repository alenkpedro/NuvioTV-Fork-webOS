# Attribution

This experimental webOS target derives from ysosrs123/NuvioTV-Fork,
commit 45e0984c18460d2a65c5d745999011b4314328eb, itself derived from
NuvioMedia/NuvioTV. Code and bundled Nuvio artwork are retained under the
project's GPL-3.0 license. Original copyright and attribution remain in
the repository. This port is not an official release from those maintainers.

The ranking, metadata extraction and filter behavior are adapted from
StreamQualityRank.kt, DirectDebridStreamFilter.kt and StreamTextSizeParser.kt.
Preference and release-group data are extracted from DebridSettings.kt and
TrashReleaseGroups.kt, with source hashes checked during builds.

TrashReleaseGroups.kt attributes its data to TRaSH Guides (MIT),
Copyright (c) 2021 TRaSH; upstream reference commit 1027cd5, 2026-07-16.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The interface bundles the original, unmodified Inter variable font from the
Android fork. Copyright (c) 2016 The Inter Project Authors
(https://github.com/rsms/inter). SIL Open Font License 1.1; the complete license
is included at assets/fonts/OFL.txt. No external font service is contacted.

Sidebar search/library/settings SVGs are copied unchanged from the fork's
res/raw directory. Their SVG Repo attribution comments remain intact.
Material icon paths follow the Android Material icons used by the reference.
They are distributed under Apache License 2.0; see assets/icons/MATERIAL-LICENSE.txt.
Build/test tools are development dependencies only.


QR generation: qrcode-generator 2.0.4, Copyright (c) 2009 Kazuhiko Arase.
MIT License. The QR is generated locally; no pairing URL is sent to a QR service.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Assets and metadata added in 0.10

`assets/icons/trailer_play_button.svg` and `assets/tmdb.svg` are byte-for-byte
copies of `app/src/main/res/raw/trailer_play_button.svg` and `mdblist_tmdb.svg`
from the selected Android fork. The original SVG Repo attribution is retained.
TMDB and YouTube names/logos remain the property of their respective owners.
This product uses the TMDB API but is not endorsed or certified by TMDB.
No private Android build credentials or YouTube resolver service are included.

## Ratings artwork (0.11)

Files in `assets/ratings/` are unmodified copies of the selected fork's
`res/raw/mdblist_{trakt,tmdb,letterboxd,mal,tomatoes}.svg`, `imdb_logo_2016.svg`,
and `res/drawable/mdblist_{audience,metacritic}.png`. Provider logos remain the
property of their owners. The MDBList integration reads aggregate ratings only.
