# Independent reference: direct recursion plus R's sample ACF/PACF.
# Called by check_arma.mjs; base R is sufficient.
ars <- list(numeric(), .7, c(.65, -.5), c(.65, -.55, .45))
mas <- list(numeric(), .5, c(.5, .35), c(.5, .4, .3))
cases <- list()
for (ar in ars) for (ma in mas) cases[[length(cases) + 1]] <- list(ar=ar, ma=ma)
cases <- c(cases, list(
  list(ar=-.5, ma=numeric()), list(ar=.99, ma=numeric()),
  list(ar=1, ma=numeric()), list(ar=1.2, ma=numeric()),
  list(ar=c(1.2, -.5), ma=numeric()), list(ar=c(0, 0, .4), ma=c(0, .2)),
  list(ar=numeric(), ma=1), list(ar=numeric(), ma=2),
  list(ar=.5, ma=-.5), list(ar=c(0, 1), ma=c(0, 0, 1)),
  list(ar=c(.2, .1, -.3), ma=c(-.4, .2, -.1)),
  list(ar=c(1.3, -.8, .2), ma=c(.8, .4, -.2))
))
outside <- function(coefs) {
  while (length(coefs) && tail(coefs, 1) == 0) coefs <- head(coefs, -1)
  !length(coefs) || all(Mod(polyroot(c(1, coefs))) > 1 + 1e-10)
}
vec <- function(xs) paste0('[', paste(sprintf('%.17g', xs), collapse=','), ']')
bool <- function(x) if (x) 'true' else 'false'
errors <- 2 * sin(seq_len(2200) * sqrt(2)) + cos(seq_len(2200) * sqrt(3))
output <- vapply(cases, function(case) {
  ar <- case$ar; ma <- case$ma
  stationary <- outside(-ar); invertible <- outside(ma)
  burn <- if (stationary) 2000 else 0
  values <- numeric(burn + 200)
  for (t in seq_along(values)) {
    values[t] <- errors[t]
    for (j in seq_along(ar)) if (t > j) values[t] <- values[t] + ar[j] * values[t-j]
    for (j in seq_along(ma)) if (t > j) values[t] <- values[t] + ma[j] * errors[t-j]
  }
  shown <- tail(values, 200)
  # Normalizing protects the reference autocovariances for explosive examples too.
  scaled <- shown / max(abs(shown))
  paste0('{"ar":', vec(ar), ',"ma":', vec(ma),
    ',"stationary":', bool(stationary), ',"invertible":', bool(invertible),
    ',"values":', vec(shown),
    ',"acf":', vec(as.numeric(acf(scaled, lag.max=15, plot=FALSE)$acf)[-1]),
    ',"pacf":', vec(as.numeric(pacf(scaled, lag.max=15, plot=FALSE)$acf)), '}')
}, character(1))
cat(paste0('[', paste(output, collapse=','), ']'))
