/* Marks the nav band once the page has moved. One condition, not four: the
   original ran the same test separately for .image, .nav-bar, .nav-bar a and
   .nav-links, of which only the middle two exist in any page on the site. */
$(window).on('scroll', function () {
  var past = $(window).scrollTop() >= $(window).height() * 0.05;
  $('.nav-bar').toggleClass('scrolling', past);
  $('.nav-bar a').toggleClass('scrolling', past);
});

$(document).ready(function() {
  // Smooth scrolling for all anchor links.
  //
  // Two exclusions, both load-bearing on the gallery page:
  //   [data-no-smooth-scroll]  the atlas links use the hash as ROUTING, not as
  //                            a scroll target. preventDefault() here would
  //                            stop the hash ever changing and the region
  //                            would never open.
  //   missing target           $(hash).offset() returns undefined on an empty
  //                            set, so .top threw a TypeError and killed every
  //                            handler registered after this one.
  $("a[href^='#']").not("[data-no-smooth-scroll]").on('click', function(event) {
    if (this.hash === "") return;

    var target = $(this.hash);
    if (!target.length) return;

    event.preventDefault();

    // Get current navbar height (will update on resize)
    var navHeight = $('.nav-bar').outerHeight();

    // Someone who has asked their system for less movement should get the
    // jump, not an 800ms glide. Same destination either way.
    var still = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Animate scroll
    $('html, body').animate({
      scrollTop: target.offset().top - navHeight
    }, still ? 0 : 800);
  });
});
