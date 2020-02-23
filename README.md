# AutoMp3Tagger
 Automatically adds ID3 tags to your MP3 files

To use it pass as an argument the file path of the mp3 file to tag or a folder with some mp3s inside to tag. The script retrieves the track title and artist from the already present ID3 tags and uses them to search on Spotify the remaining tags

Two additional parameter are
- -f : to force the overwrite of the already present tags with the newly searched ones
- -n : to use the file name in the search query instead of the title and artist tag (if there is no name and/or artist tag on the mp3, the file name will be used by default)

### Setup

The script needs a spotify client id and a spotify client secret as env variables. To get one go on [here](https://developer.spotify.com/dashboard/) and create a new app. No particular settings are needed.

### Disclaimer
Works better if the file name doesn't have any additional useless information, keep it simple, "artist - title". Sometimes spotify's search doesn't return anything, change the file name a bit or just wait and it'll work