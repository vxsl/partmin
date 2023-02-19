"""This module reverse geocodes a list of circles.

The input is a list of circles, each circle is a list of 3 elements:
    [radius, latitude, longitude]

The output is a list of circles, each circle is a dictionary of 3 elements:
    {'radius': radius, 'fsa': fsa, 'lat': latitude, 'lng': longitude}

The input is a URL, the output is a JSON string."""

from urllib import parse
import json
import geopy
geo_locator = geopy.Nominatim(user_agent='1234')

with open('../config.json', 'r', encoding='utf-8') as f:

    config = json.load(f)
    url = config.get("search").get("location").get("mapDevelopersURL")

    params = dict(parse.parse_qsl(parse.urlsplit(url).query))
    circles = [
        {
            'radius': round(c[0]/100, 4),
            'fsa': geo_locator.reverse((c[1], c[2]))
            .raw['address']['postcode']
            .split(" ")[0],
        }
        for c in json.loads(params.get('circles'))]

    with open('../tmp/circles.json', 'w', encoding='utf-8') as f:
        json.dump(circles, f)
