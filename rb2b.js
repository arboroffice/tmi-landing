// RB2B visitor identification pixel (person-level de-anonymization).
// Loaded site-wide alongside the Meta Pixel. RB2B resolves anonymous US
// visitors to a person and POSTs the profile to a webhook configured in the
// RB2B dashboard -> point it at https://www.tmi-technology.com/api/rb2b-webhook
// Key: E63P0HZ15KOW
(function (key) {
  if (window.reb2b) return;
  window.reb2b = { loaded: true };
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://ddwl4m2hdecbv.cloudfront.net/b/' + key + '/' + key + '.js.gz';
  var first = document.getElementsByTagName('script')[0];
  first.parentNode.insertBefore(s, first);
})('E63P0HZ15KOW');
