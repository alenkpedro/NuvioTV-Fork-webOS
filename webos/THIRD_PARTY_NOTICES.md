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

The interface uses the operating-system sans-serif font; no external font
service is contacted. Build/test tools are development dependencies only.
