# List daily entry sums

Get daily entry sums.

```
GET /entries/sums
```

Required [scope](https://developer.toshl.com/docs/auth#scope):

- entries:r

## Parameters

|                                           |                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **page**<br>_optional_<br>`integer`       | Page to display, used for [pagination](https://developer.toshl.com/docs#pagination).<br> _Minimum:_ `>= 0`<br>_Default value:_ `0`                      |
| **per_page**<br>_optional_<br>`integer`   | Number of resource objects to return.<br> _Minimum:_ `>= 10`<br>_Maximum:_ `=< 500`<br>_Default value:_ `200`                                           |
| **from \***<br>_required_<br>`string`     | Used to define date range, in YYYY-MM-DD format. To filter by date both from and to must be set.<br> _Format:_ `date`                                   |
| **to \***<br>_required_<br>`string`       | Used to define date range, in YYYY-MM-DD format. To filter by date both from and to must be set.<br> _Format:_ `date`                                   |
| **currency \***<br>_required_<br>`string` | Currency the sums are to be calculated in.<br> _Regex:_ `[A-Z0-9_]{2,10}`                                                                               |
| **accounts**<br>_optional_<br>`string`    | A comma separated list of account ids. If used only sums for entries from the specified accounts are returned.                                          |
| **categories**<br>_optional_<br>`string`  | A comma separated list of category ids. If used only sums for entries in the specified categories are returned.                                         |
| **!categories**<br>_optional_<br>`string` | A comma separated list of category ids. If used only sums for entries _not_ in the specified categories are returned.                                   |
| **tags**<br>_optional_<br>`string`        | A comma separated list of tag ids. If used only sums for entries _with_ the specified tags are returned.                                                |
| **!tags**<br>_optional_<br>`string`       | A comma separated list of tag ids. If used only sums for entries _without_ the specified tags are returned.                                             |
| **locations**<br>_optional_<br>`string`   | A comma separated list of location ids. If used only sums for entries entered at the specified locations are returned.                                  |
| **!locations**<br>_optional_<br>`string`  | A comma separated list of location ids. If used sums for entries _not_ entered at the specified locations are returned.                                 |
| **search**<br>_optional_<br>`string`      | Used to search entries.                                                                                                                                 |
| **since**<br>_optional_<br>`string`       | Return all sums that were modified since timestamp.<br> _Format:_ `date-time`                                                                           |
| **range**<br>_optional_<br>`string`       | Sum range. If set sums will be calculated for the defined range (day, week, month).<br> _Possible values:_ `day, week, month`<br>_Default value:_ `day` |
| **type**<br>_optional_<br>`string`        | Entry types to sum<br> _Possible values:_ `expense, income`                                                                                             |

**\*** denotes _required_ field/parameter.

## Request

```
$ curl https://api.toshl.com/entries/sums \
  -H "Authorization: Bearer $TOSHL_API_TOKEN"
```

## Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "day": "2013-01-02",
    "expenses": {
      "sum": 15.30,
      "count": 2
    },
    "modified": "2012-09-04T13:55:15Z"
  }
]
```

Page last modified: 08 Jan 2024
