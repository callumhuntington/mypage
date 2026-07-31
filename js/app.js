$(window).scroll(function() {    
    var blockscroll = $(window).scrollTop();
    if (blockscroll >= $(window).height()*0.05) {
        $(".image").addClass("scrolling");
    } else {
        $(".image").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-bar a").addClass("scrolling");
    } else {
        $(".nav-bar a").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-bar").addClass("scrolling");
    } else {
        $(".nav-bar").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-links").addClass("scrolling");
    } else {
        $(".nav-links").removeClass("scrolling");
    }
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

    // Animate scroll
    $('html, body').animate({
      scrollTop: target.offset().top - navHeight
    }, 800);
  });
});
