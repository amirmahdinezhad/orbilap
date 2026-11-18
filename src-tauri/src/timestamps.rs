use time::format_description::well_known::Rfc3339;
use time::{OffsetDateTime, UtcOffset};

pub(crate) fn parse_rfc3339(value: &str) -> Result<OffsetDateTime, time::error::Parse> {
    OffsetDateTime::parse(value, &Rfc3339)
}

pub(crate) fn format_rfc3339(value: OffsetDateTime) -> String {
    let utc = value.to_offset(UtcOffset::UTC);
    let mut formatted = utc.format(&Rfc3339).expect("valid UTC RFC 3339 date");
    formatted.pop(); // The UTC formatter ends with Z.
    if let Some(dot) = formatted.find('.') {
        let digits = formatted.len() - dot - 1;
        let width = digits.div_ceil(3) * 3;
        formatted.extend(std::iter::repeat_n('0', width - digits));
    }
    // Keep the format already used by saved profiles and provider stores.
    formatted.push_str("+00:00");
    formatted
}

pub(crate) fn now_rfc3339() -> String {
    format_rfc3339(OffsetDateTime::now_utc())
}

pub(crate) fn unix_millis(value: OffsetDateTime) -> i64 {
    value.unix_timestamp_nanos().div_euclid(1_000_000) as i64
}

pub(crate) fn from_unix_millis(value: i64) -> Option<OffsetDateTime> {
    OffsetDateTime::from_unix_timestamp_nanos(i128::from(value) * 1_000_000)
        .ok()
        .filter(|date| date.year() >= 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_offsets_and_preserves_saved_utc_format() {
        let instant = parse_rfc3339("2026-11-18T23:09:42.12+03:30").unwrap();
        assert_eq!(format_rfc3339(instant), "2026-11-18T19:39:42.120+00:00");
        assert_eq!(from_unix_millis(unix_millis(instant)), Some(instant));
    }

    #[test]
    fn truncates_to_the_earlier_millisecond_before_the_epoch() {
        let instant = parse_rfc3339("1969-12-31T23:59:59.999999999Z").unwrap();
        assert_eq!(unix_millis(instant), -1);
        assert_eq!(format_rfc3339(instant), "1969-12-31T23:59:59.999999999+00:00");
    }
}
