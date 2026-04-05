# List entries

Get all users entries.

```
GET /entries
```

Required [scope](https://developer.toshl.com/docs/auth#scope):

- entries:r

## Parameters

|                                                |                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **page**<br>_optional_<br>`integer`            | Page to display, used for [pagination](https://developer.toshl.com/docs#pagination).<br> _Minimum:_ `>= 0`<br>_Default value:_ `0` |
| **per_page**<br>_optional_<br>`integer`        | Number of resource objects to return.<br> _Minimum:_ `>= 10`<br>_Maximum:_ `=< 500`<br>_Default value:_ `200`                      |
| **since**<br>_optional_<br>`string`            | Return all entries that were modified since timestamp.<br> _Format:_ `date-time`                                                   |
| **from \***<br>_required_<br>`string`          | Used to define date range, in YYYY-MM-DD format. To filter by date both from and to must be set.<br> _Format:_ `date`              |
| **to \***<br>_required_<br>`string`            | Used to define date range, in YYYY-MM-DD format. To filter by date both from and to must be set.<br> _Format:_ `date`              |
| **type**<br>_optional_<br>`string`             | Entry types to return<br> _Possible values:_ `expense, income, transaction`                                                        |
| **accounts**<br>_optional_<br>`string`         | A comma separated list of account ids. If used only entries from the specified accounts are returned.                              |
| **categories**<br>_optional_<br>`string`       | A comma separated list of category ids. If used only entries in the specified categories are returned.                             |
| **!categories**<br>_optional_<br>`string`      | A comma separated list of category ids. If used only entries _not_ in the specified categories are returned.                       |
| **tags**<br>_optional_<br>`string`             | A comma separated list of tag ids. If used only entries _with_ the specified tags are returned.                                    |
| **!tags**<br>_optional_<br>`string`            | A comma separated list of tag ids. If used only entries _without_ the specified tags are returned.                                 |
| **locations**<br>_optional_<br>`string`        | A comma separated list of location ids. If used only entries entered at the specified locations are returned.                      |
| **!locations**<br>_optional_<br>`string`       | A comma separated list of location ids. If used entries _not_ entered at the specified locations are returned.                     |
| **repeat**<br>_optional_<br>`string`           | Used to return only entries that are part of the specified repeat.                                                                 |
| **parent**<br>_optional_<br>`string`           | Used to return only entries with the same parent.                                                                                  |
| **search**<br>_optional_<br>`string`           | Used to search entries.                                                                                                            |
| **include_deleted**<br>_optional_<br>`boolean` | Include deleted entries.                                                                                                           |
| **expand**<br>_optional_<br>`boolean`          | If set to true the API will automatically expand repeating entries.                                                                |

**\*** denotes _required_ field/parameter.

## Request

```
$ curl https://api.toshl.com/entries \
  -H "Authorization: Bearer <API-KEY>"
```

## Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": "42",
    "amount": -13.37,
    "currency": {
      "code": "USD",
      "rate": 1,
      "fixed": false
    },
    "date": "2012-09-04",
    "desc": "Entry description",
    "account": "45",
    "category": "42",
    "tags": ["42", "43"],
    "location": {
      "id": "44",
      "latitude": 46.051426,
      "longitude": 14.505966
    },
    "modified": "2012-09-04T13:55:15Z",
    "repeat": {
      "id": "41",
      "frequency": "monthly",
      "interval": 1,
      "start": "2012-09-04",
      "count": 10,
      "iteration": 1,
      "template": true
    },
    "images": [{
      "id": "43",
      "path": "https://img.toshl.com/12/1404134603-ab820800-954f-46a7-95ff-fee7d961b31f/",
      "status": "uploaded"
    }],
    "reminders": [{
      "period": "week",
      "number": 2,
      "at": "11:25"
    }],
    "completed": false
  }
]
```

Page last modified: 08 Jan 2024
